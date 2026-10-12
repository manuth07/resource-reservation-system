import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";

export class RateLimitError extends Error {
  constructor() { super("Too many attempts or security service unavailable. Try again later."); }
}

const globalLimits = globalThis as unknown as { primeWaveLimits?: Map<string, { count: number; expires: number }> };
const local = globalLimits.primeWaveLimits ??= new Map();
const SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";

export async function enforceRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const key = `primewave:${scope}:${createHash("sha256").update(identity).digest("hex")}`;
  const url = process.env.RATE_LIMIT_REDIS_REST_URL;
  const token = process.env.RATE_LIMIT_REDIS_REST_TOKEN;
  if (url || token) {
    try {
      if (!url || !token || new URL(url).protocol !== "https:") throw new RateLimitError();
      const response = await fetch(url, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", SCRIPT, "1", key, String(windowMs)]),
        cache: "no-store", signal: AbortSignal.timeout(3000),
      });
      const data = await response.json() as { result?: unknown; error?: unknown };
      if (!response.ok || data.error || !Number.isSafeInteger(data.result) || (data.result as number) < 1 || (data.result as number) > limit) throw new RateLimitError();
      return;
    } catch { throw new RateLimitError(); }
  }
  // Never use process-local counters as production/serverless protection.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new RateLimitError();
  const now = Date.now();
  for (const [id, entry] of local) if (entry.expires <= now) local.delete(id);
  if (!local.has(key) && local.size >= 10000) throw new RateLimitError();
  const entry = local.get(key) ?? { count: 0, expires: now + windowMs };
  local.set(key, entry);
  if (++entry.count > limit) throw new RateLimitError();
}

export async function limitLogin(employeeId: string, request?: Request) {
  // Only trust Vercel's platform header on Vercel. Else use a conservative shared
  // deployment bucket, never a caller-controlled X-Forwarded-For value.
  const header = process.env.VERCEL ? request?.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const ip = header && isIP(header) ? header : "deployment";
  await enforceRateLimit("login-source", ip, 30, 60_000);
  await enforceRateLimit("login-account", employeeId, 5, 15 * 60_000);
}
