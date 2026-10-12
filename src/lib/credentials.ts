import "server-only";

import { verify } from "argon2";
import { AccountStatus } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { limitLogin } from "@/lib/rate-limit";

// Public dummy digest of random data, not an account credential. Missing users
// still incur an Argon2id verification rather than an immediate rejection.
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$9gRImTIhz6JK44XevsfwZQ$eTIp5vrwYEEx4i3EhL2iEitPD4puZ29gO8ikG48ydHs";

export function normalizeEmployeeId(value: string): string {
  return value.trim().toUpperCase();
}

export async function verifyEmployeeCredentials(
  credentials: Partial<Record<"employeeId" | "password", unknown>>,
  request?: Request,
) {
  if (
    typeof credentials.employeeId !== "string" ||
    typeof credentials.password !== "string"
  ) {
    return null;
  }

  const employeeId = normalizeEmployeeId(credentials.employeeId);
  const password = credentials.password; // Never trim or normalize passwords.

  if (!employeeId || employeeId.length > 128 || !password || password.length > 1024) {
    return null;
  }
  try { await limitLogin(employeeId, request); } catch { return null; }

  // Existing text uniqueness is case-sensitive. Fail closed if two legacy IDs
  // normalize to the same identity; future provisioning must use this normalizer.
  // Parameterized equality avoids Prisma's insensitive-equals ILIKE behavior.
  // %, _, and backslashes are literal ID characters, not pattern operators.
  const users = await prisma.$queryRaw<
    Pick<User, "id" | "employeeId" | "role" | "accountStatus" | "passwordHash" | "sessionVersion">[]
  >`
    SELECT "id", "employeeId", "role", "accountStatus", "passwordHash", "sessionVersion"
    FROM "public"."User"
    WHERE upper("employeeId") = ${employeeId}
    LIMIT 2
  `;
  const user = users.length === 1 ? users[0] : undefined;
  const hasArgon2idHash = user?.passwordHash.startsWith("$argon2id$") ?? false;
  let passwordMatches = false;

  try {
    passwordMatches = await verify(
      user && hasArgon2idHash ? user.passwordHash : DUMMY_HASH,
      password,
    );
  } catch {
    // A corrupt digest is an authentication failure, never a public hash error.
    await verify(DUMMY_HASH, password);
  }

  if (!user || !hasArgon2idHash || !passwordMatches || user.accountStatus !== AccountStatus.ACTIVE) {
    return null;
  }

  return {
    id: user.id,
    employeeId: normalizeEmployeeId(user.employeeId),
    role: user.role,
    sessionVersion: user.sessionVersion,
  };
}
