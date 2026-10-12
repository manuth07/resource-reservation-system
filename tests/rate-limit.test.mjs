import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as net from "node:net";
import test from "node:test";
import { loadSource } from "./helpers/source.mjs";
const mocks = { "node:crypto": crypto, "node:net": net };

test("local-development counters reject attempts beyond the limit", async () => {
  const limiter = loadSource("src/lib/rate-limit.ts", mocks, { NODE_ENV: "test" });
  await limiter.enforceRateLimit("fixture", "identity", 2, 60000);
  await limiter.enforceRateLimit("fixture", "identity", 2, 60000);
  await assert.rejects(limiter.enforceRateLimit("fixture", "identity", 2, 60000));
});

test("production and Vercel fail closed without durable shared storage", async () => {
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL: "1" }]) {
    const limiter = loadSource("src/lib/rate-limit.ts", mocks, env);
    await assert.rejects(limiter.enforceRateLimit("fixture", "identity", 2, 60000));
  }
});

test("shared rate limiting uses atomic Redis expiry and hides identifiers in keys", async () => {
  let count = 0;
  const limiter = loadSource("src/lib/rate-limit.ts", mocks, { NODE_ENV: "production", RATE_LIMIT_REDIS_REST_URL: "https://redis.example.invalid", RATE_LIMIT_REDIS_REST_TOKEN: "fixture-token" }, {
    fetch: async (_url, options) => {
      const command = JSON.parse(options.body);
      assert.equal(command[0], "EVAL");
      assert.match(command[1], /INCR/);
      assert.match(command[1], /PEXPIRE/);
      assert.ok(!command[3].includes("EMP001"));
      return Response.json({ result: ++count });
    },
  });
  await limiter.enforceRateLimit("fixture", "EMP001", 1, 60000);
  await assert.rejects(limiter.enforceRateLimit("fixture", "EMP001", 1, 60000));
});

test("Redis outages, invalid responses and partial configuration fail closed", async () => {
  for (const fetch of [async () => { throw new Error("network error"); }, async () => Response.json({ result: "invalid" }), async () => Response.json({ error: "denied" })]) {
    const limiter = loadSource("src/lib/rate-limit.ts", mocks, { NODE_ENV: "production", RATE_LIMIT_REDIS_REST_URL: "https://redis.example.invalid", RATE_LIMIT_REDIS_REST_TOKEN: "fixture-token" }, { fetch });
    await assert.rejects(limiter.enforceRateLimit("fixture", "identity", 2, 60000));
  }
  const partial = loadSource("src/lib/rate-limit.ts", mocks, { NODE_ENV: "test", RATE_LIMIT_REDIS_REST_URL: "https://redis.example.invalid" });
  await assert.rejects(partial.enforceRateLimit("fixture", "identity", 2, 60000));
});
