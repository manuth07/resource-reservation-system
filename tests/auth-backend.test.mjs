import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as argon2 from "argon2";
import * as React from "react";

// Exercise the actual TypeScript functions with framework/database boundaries
// mocked. No database connection, account creation, or real credentials are used.
function loadSource(path, mocks, env = { AUTH_SECRET: "test-only-secret-with-at-least-32-characters" }) {
  const { outputText } = ts.transpileModule(readFileSync(resolve(path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (name === "server-only") return {};
      if (name === "react") return React;
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env },
    Buffer,
    console,
  }, { filename: path });
  return exports;
}

const enums = loadSource("src/generated/prisma/enums.ts", {});
const digest = await argon2.hash("fixture password", { type: argon2.argon2id });
const account = {
  id: "53af67e7-f7ed-469d-a650-f18455fe6a31",
  employeeId: "EMP001",
  role: "EMPLOYEE",
  accountStatus: "ACTIVE",
  departmentId: "department-fixture",
  mustChangePassword: false,
  passwordHash: digest,
  sessionVersion: 0,
};

function credentialsFor(records, onQuery) {
  return loadSource("src/lib/credentials.ts", {
    argon2,
    "@/generated/prisma/enums": enums,
    "@/lib/rate-limit": { limitLogin: async () => {} },
    "@/lib/prisma": { prisma: { $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      assert.match(sql, /FROM "public"\."User"\s+WHERE upper\("employeeId"\) = \?\s+LIMIT 2/);
      assert.doesNotMatch(sql, /\bILIKE\b|\bLIKE\b/i);
      assert.equal(values.length, 1);
      onQuery?.({ sql, employeeId: values[0] });
      // Simulate equality, not PostgreSQL: actual integration remains separate.
      return records.filter((record) => record.employeeId.toUpperCase() === values[0]).slice(0, 2);
    } } },
  });
}

function loadAuth(env) {
  let config;
  class AuthError extends Error {}
  loadSource("src/auth.ts", {
    "next-auth": { default: (value) => { config = value; return {}; }, AuthError },
    "next-auth/providers/credentials": { default: (value) => value },
    "@/lib/credentials": { verifyEmployeeCredentials: async () => null },
    "@/generated/prisma/enums": enums,
  }, env);
  return config;
}

test("credentials normalize IDs, preserve password bytes, and return only safe claims", async () => {
  let query;
  const credentials = credentialsFor([{ ...account, employeeId: "eMp001" }], (args) => { query = args; });
  const user = await credentials.verifyEmployeeCredentials({ employeeId: " emp001 ", password: "fixture password" });
  assert.equal(query.employeeId, "EMP001");
  assert.equal(user.id, account.id);
  assert.deepEqual(Object.keys(user).sort(), ["employeeId", "id", "role", "sessionVersion"]);
  assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: "EMP001", password: " fixture password " }), null);
});

test("missing, inactive, ambiguous, wrong-password and corrupt-hash logins fail uniformly", async () => {
  for (const records of [[], [{ ...account, accountStatus: "INACTIVE" }], [account, account], [{ ...account, passwordHash: "$argon2id$corrupt" }], [{ ...account, passwordHash: "plaintext" }]]) {
    const credentials = credentialsFor(records);
    assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: "EMP001", password: "fixture password" }), null);
  }
  const credentials = credentialsFor([account]);
  assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: "EMP001", password: "incorrect" }), null);
  assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: 123, password: "fixture password" }), null);
  assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: "", password: "fixture password" }), null);
  assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: "EMP001", password: "x".repeat(1025) }), null);
});

test("JWT/session callbacks allowlist claims and ignore forged update data", () => {
  const config = loadAuth();
  assert.equal(config.session.strategy, "jwt");
  assert.equal(config.adapter, undefined);
  const token = config.callbacks.jwt({ token: {}, user: account });
  assert.deepEqual(Object.keys(token).sort(), ["employeeId", "role", "sessionVersion", "sub"]);
  const updated = config.callbacks.jwt({ token, trigger: "update", session: {
    sub: "attacker-id", id: "attacker-id", employeeId: "ADMIN001", role: "ADMIN", sessionVersion: 999,
    user: { id: "attacker-id", employeeId: "ADMIN001", role: "ADMIN" },
  } });
  assert.equal(updated.sub, account.id);
  assert.equal(updated.employeeId, account.employeeId);
  assert.equal(updated.role, "EMPLOYEE");
  assert.equal(updated.sessionVersion, 0);
  const session = config.callbacks.session({ session: { expires: "fixture-expiry", user: account }, token });
  assert.deepEqual(Object.keys(session.user).sort(), ["employeeId", "id", "role", "sessionVersion"]);
  assert.equal(session.user.id, account.id);
  assert.equal(session.user.employeeId, account.employeeId);
  assert.equal(session.user.role, account.role);
  assert.throws(() => config.callbacks.session({ session, token: {} }), /Invalid session/);
  for (const sessionVersion of [undefined, -1, 0.5, "0"]) {
    assert.equal(config.callbacks.jwt({ token: { ...token, sessionVersion } }), null);
  }
});

test("IDs containing underscore, percent, backslash and quotes match literally", async () => {
  for (const employeeId of ["EMP_001", "EMP%001", "EMP\\001", "%", "_' OR TRUE --"]) {
    const credentials = credentialsFor([
      { ...account, employeeId },
      { ...account, id: "different-id", employeeId: "EMPA001" },
    ], ({ sql, employeeId: parameter }) => {
      assert.equal(parameter, employeeId);
      assert.ok(!sql.includes(employeeId)); // ID stays outside the SQL text.
    });
    assert.equal((await credentials.verifyEmployeeCredentials({ employeeId, password: "fixture password" })).id, account.id);
    const missing = credentialsFor([{ ...account, employeeId: "EMPA001" }]);
    assert.equal(await missing.verifyEmployeeCredentials({ employeeId, password: "fixture password" }), null);
  }
});

test("case-only duplicate employee IDs fail closed", async () => {
  const credentials = credentialsFor([account, { ...account, id: "different-id", employeeId: "emp001" }]);
  assert.equal(await credentials.verifyEmployeeCredentials({ employeeId: " Emp001 ", password: "fixture password" }), null);
});

test("AUTH_SECRET rejects missing, empty, short and whitespace-only values without altering valid secrets", () => {
  for (const secret of [undefined, "", "short", "x".repeat(31), " ".repeat(32), "\t\n ".repeat(32)]) {
    assert.throws(() => loadAuth({ AUTH_SECRET: secret }), /AUTH_SECRET must be configured/);
  }
  const secret = "  test-only-secret-with-at-least-32-characters  ";
  assert.equal(loadAuth({ AUTH_SECRET: secret }).secret, secret);
});

test("unauthenticated sessions cannot retrieve users or pass authorization guards", async () => {
  for (const session of [null, { user: undefined }, { user: {} }]) {
    const authorization = loadSource("src/lib/authorization.ts", {
      "@/auth": { auth: async () => session },
      "@/generated/prisma/enums": enums,
      "@/lib/prisma": { prisma: { user: { findUnique: async () => { assert.fail("Unauthenticated request queried PostgreSQL"); } } } },
    });
    assert.equal(await authorization.getAuthenticatedUser(), null);
    await assert.rejects(authorization.requireAuthenticatedUser(), { code: "UNAUTHENTICATED", status: 401 });
    await assert.rejects(authorization.requireRole("ADMIN"), { code: "UNAUTHENTICATED", status: 401 });
    await assert.rejects(authorization.requirePasswordChangeUser(), { code: "UNAUTHENTICATED", status: 401 });
  }
});

test("authorization checks fresh database state and gates mandatory password changes", async () => {
  let current = { ...account, mustChangePassword: true };
  const authorization = loadSource("src/lib/authorization.ts", {
    "@/auth": { auth: async () => ({ user: { id: account.id, role: "ADMIN", sessionVersion: 0 } }) },
    "@/generated/prisma/enums": enums,
    "@/lib/prisma": { prisma: { user: { findUnique: async ({ select }) => {
      assert.equal(select.passwordHash, undefined);
      return current;
    } } } },
  });
  await assert.rejects(authorization.requireAuthenticatedUser(), { code: "PASSWORD_CHANGE_REQUIRED" });
  await assert.rejects(authorization.requireRole("ADMIN"), { code: "PASSWORD_CHANGE_REQUIRED" });
  assert.equal((await authorization.requirePasswordChangeUser()).id, account.id);
  current = { ...account, mustChangePassword: false };
  await assert.rejects(authorization.requireRole("ADMIN"), { code: "FORBIDDEN" });
  assert.equal((await authorization.requireRole("EMPLOYEE", "DEPARTMENT_HEAD")).id, account.id);
  await assert.rejects(authorization.requirePasswordChangeUser(), { code: "FORBIDDEN" });
  current = { ...account, accountStatus: "INACTIVE" };
  assert.equal(await authorization.getAuthenticatedUser(), null);
  await assert.rejects(authorization.requireAuthenticatedUser(), { code: "UNAUTHENTICATED" });
  current = null;
  await assert.rejects(authorization.requirePasswordChangeUser(), { code: "UNAUTHENTICATED" });
});
