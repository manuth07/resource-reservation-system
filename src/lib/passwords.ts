import "server-only";
import { randomBytes } from "node:crypto";
import { argon2id, hash, verify } from "argon2";

export function generateTemporaryPassword(): string { return randomBytes(32).toString("base64url"); }
export function hashTemporaryPassword(password: string): Promise<string> { return hash(password, { type: argon2id }); }
export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  if (!digest.startsWith("$argon2id$")) return false;
  try { return await verify(digest, password); } catch { return false; }
}
export function passwordPolicyError(password: string): string | null {
  if (password.length < 12 || password.length > 128) return "Use 12–128 characters for your new password.";
  if (!/\p{L}/u.test(password) || !/[0-9]/.test(password)) return "Include at least one letter and one number. A longer passphrase is welcome.";
  return null;
}
