import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import * as crypto from "node:crypto";
import { loadSource } from "./source.mjs";

export const enums = loadSource("src/generated/prisma/enums.ts", {});
export const passwords = loadSource("src/lib/passwords.ts", { argon2, "node:crypto": crypto });
export const departmentId = "81f03226-ffb3-4944-8577-a10277aa7814";
export const actorId = "84936374-b62e-4bd6-8f7c-082c9c21b0ad";
export const oldPassword = "Old-fixture-password-2026";
const oldHash = await passwords.hashTemporaryPassword(oldPassword);
export const actorRecord = { id: actorId, employeeId: "ADMIN001", email: "admin@example.invalid", name: "Fixture Admin", role: "ADMIN", accountStatus: "ACTIVE", departmentId, mustChangePassword: false, sessionVersion: 0, passwordHash: oldHash };

export function serviceFor(prisma, authorization, rateLimit = async () => {}) {
  return loadSource("src/lib/account-security.ts", {
    "@/generated/prisma/client": enums,
    "@/lib/authorization": authorization,
    "@/lib/credentials": { normalizeEmployeeId: (value) => value.trim().toUpperCase() },
    "@/lib/prisma": { prisma },
    "@/lib/rate-limit": { enforceRateLimit: rateLimit },
    "@/lib/passwords": passwords,
  });
}

export function accountFixture(options = {}) {
  let state = {
    users: [{ ...actorRecord, ...options.actor }, ...(options.users ?? [])],
    departments: [{ id: departmentId, name: "Fixture Department", headId: null, ...options.department }],
  };
  let session = options.unauthenticated ? null : { user: { id: actorId, sessionVersion: 0 } };
  let queue = Promise.resolve();
  let blocked = false;
  const select = (row, fields) => row ? Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) : null;
  const change = (row, data) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value; };
  const client = {
    user: { findUnique: async ({ where, select: fields }) => select(state.users.find((u) => u.id === where.id), fields) },
    $transaction(fn) {
      const operation = queue.then(async () => {
        options.beforeTransaction?.(state);
        const snapshot = structuredClone(state);
        const tx = {
          $executeRaw: async () => 1,
          $queryRaw: async (_strings, employeeId, email) => snapshot.users.filter((u) => u.employeeId.toUpperCase() === employeeId || u.email.toLowerCase() === email).slice(0, 1),
          user: {
            findUnique: async ({ where, select: fields }) => select(snapshot.users.find((u) => u.id === where.id), fields),
            create: async ({ data }) => { const user = { id: randomUUID(), ...data }; snapshot.users.push(user); return { id: user.id }; },
            update: async ({ where, data }) => change(snapshot.users.find((u) => u.id === where.id), data),
            updateMany: async ({ where, data }) => {
              const rows = snapshot.users.filter((u) => Object.entries(where).every(([key, value]) => u[key] === value));
              for (const row of rows) change(row, data);
              return { count: rows.length };
            },
          },
          department: {
            findUnique: async ({ where }) => snapshot.departments.find((d) => d.id === where.id) ?? null,
            update: async ({ where, data }) => {
              if (options.failDepartmentUpdate) throw new Error("Simulated department update failure");
              Object.assign(snapshot.departments.find((d) => d.id === where.id), data);
            },
          },
        };
        const result = await fn(tx);
        state = snapshot;
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
  const authorization = loadSource("src/lib/authorization.ts", {
    "@/auth": { auth: async () => session }, "@/generated/prisma/enums": enums, "@/lib/prisma": { prisma: client },
  });
  const service = serviceFor(client, authorization, async () => { if (blocked) throw new Error("Rate limited"); });
  return { service, authorization, state: () => state, session: (value) => { session = value; }, limit: () => { blocked = true; } };
}
