import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as argon2 from "argon2";
import { loadSource } from "./helpers/source.mjs";

const passwords = loadSource("src/lib/passwords.ts", {
  "node:crypto": { randomBytes(size) { assert.equal(size, 32); return randomBytes(size); } },
  argon2,
});

const { outputText } = ts.transpileModule(readFileSync(resolve("scripts/lib/admin-bootstrap.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const bootstrap = {};
vm.runInNewContext(outputText, {
  exports: bootstrap,
  require(name) {
    if (name === "server-only") return {};
    if (name === "node:crypto") return { randomBytes(size) { assert.equal(size, 32); return randomBytes(size); } };
    if (name === "argon2") return argon2;
    if (name === "../../src/lib/passwords") return passwords;
    if (name === "../../src/generated/prisma/client") return {
      UserRole: { ADMIN: "ADMIN" }, AccountStatus: { ACTIVE: "ACTIVE" },
      Prisma: { TransactionIsolationLevel: { ReadCommitted: "ReadCommitted" } },
    };
    throw new Error(`Unexpected dependency: ${name}`);
  },
}, { filename: "scripts/lib/admin-bootstrap.ts" });

const details = { name: "Fixture Admin", email: "admin@example.invalid" };

// Transaction rollback and serialization are simulated, NOT PostgreSQL integration.
function mockDatabase(initial = {}) {
  let state = { users: [], departments: [], ...initial };
  let queue = Promise.resolve();
  const events = [];
  const client = {
    $transaction(fn, options) {
      assert.equal(options.isolationLevel, "ReadCommitted");
      const operation = queue.then(async () => {
        const snapshot = structuredClone(state);
        let locked = false;
        const requireLock = () => assert.ok(locked, "Database reads/writes must follow the advisory lock");
        const tx = {
          $executeRaw: async (strings) => {
            assert.match(strings.join("?"), /pg_advisory_xact_lock\(742019, 1\)/);
            locked = true;
            events.push("lock");
            return 1;
          },
          $queryRaw: async (strings, employeeId) => {
            requireLock();
            assert.match(strings.join("?"), /upper\("employeeId"\) = \?/);
            return snapshot.users.filter((u) => u.employeeId.toUpperCase() === employeeId).slice(0, 1);
          },
          user: {
            findFirst: async ({ where }) => {
              requireLock();
              assert.equal(where.role, "ADMIN");
              return snapshot.users.find((u) => u.role === where.role) ?? null;
            },
            create: async ({ data }) => {
              requireLock();
              if (snapshot.users.some((u) => u.email === data.email)) throw new Error("simulated unique constraint failure");
              const user = { id: "fixture-user", ...data };
              snapshot.users.push(user);
              events.push("create-user");
              return { id: user.id, employeeId: user.employeeId };
            },
          },
          department: {
            findMany: async () => {
              requireLock();
              return snapshot.departments.filter((d) => d.code === "ADMINISTRATION" || d.name === "Administration").slice(0, 2);
            },
            create: async ({ data }) => {
              requireLock();
              const department = { id: "fixture-department", ...data };
              snapshot.departments.push(department);
              events.push("create-department");
              return { id: department.id };
            },
          },
        };
        const result = await fn(tx);
        state = snapshot;
        events.push("commit");
        return result;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
  return { client, events, state: () => state };
}

test("temporary passwords use 32 cryptographic random bytes and valid base64url encoding", () => {
  const passwords = new Set(Array.from({ length: 50 }, () => bootstrap.generateTemporaryPassword()));
  assert.equal(passwords.size, 50);
  for (const password of passwords) {
    assert.match(password, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(password, "base64url").length, 32);
  }
});

test("temporary passwords are hashed with Argon2id and verify correctly", async () => {
  const password = bootstrap.generateTemporaryPassword();
  const digest = await bootstrap.hashTemporaryPassword(password);
  assert.ok(digest.startsWith("$argon2id$"));
  assert.ok(digest !== password);
  assert.equal(await argon2.verify(digest, password), true);
  assert.equal(await argon2.verify(digest, bootstrap.generateTemporaryPassword()), false);
});

test("successful bootstrap commits the department and active password-change-only ADMIN", async () => {
  const db = mockDatabase();
  const result = await bootstrap.bootstrapInitialAdmin(db.client, details);
  const user = db.state().users[0];
  assert.equal(user.employeeId, "ADMIN001");
  assert.equal(user.role, "ADMIN");
  assert.equal(user.accountStatus, "ACTIVE");
  assert.equal(user.mustChangePassword, true);
  assert.equal(user.departmentId, db.state().departments[0].id);
  assert.equal(db.state().departments[0].code, "ADMINISTRATION");
  assert.equal(await argon2.verify(user.passwordHash, result.temporaryPassword), true);
  assert.ok(!JSON.stringify(db.state()).includes(result.temporaryPassword));
  assert.deepEqual(Object.keys(result).sort(), ["employeeId", "temporaryPassword"]);
  assert.equal(db.events.at(-1), "commit");
});

test("repeated bootstrap, including an inactive ADMIN, rejects without modification", async () => {
  for (const accountStatus of ["ACTIVE", "INACTIVE"]) {
    const db = mockDatabase({ users: [{ employeeId: "EXISTING001", role: "ADMIN", accountStatus }] });
    const before = structuredClone(db.state());
    await assert.rejects(bootstrap.bootstrapInitialAdmin(db.client, details), /administrator account already exists/);
    assert.deepEqual(db.state(), before);
    assert.deepEqual(db.events, ["lock"]);
  }
  const db = mockDatabase();
  await bootstrap.bootstrapInitialAdmin(db.client, details);
  const before = structuredClone(db.state());
  await assert.rejects(bootstrap.bootstrapInitialAdmin(db.client, details), /administrator account already exists/);
  assert.deepEqual(db.state(), before);
});

test("case-insensitive reserved-ID collision rejects rather than promoting an employee", async () => {
  const db = mockDatabase({ users: [{ employeeId: "admin001", role: "EMPLOYEE" }] });
  const before = structuredClone(db.state());
  await assert.rejects(bootstrap.bootstrapInitialAdmin(db.client, details), /reserved employee ID/);
  assert.deepEqual(db.state(), before);
});

test("existing Administration department is reused; conflicting departments are rejected", async () => {
  const department = { id: "existing-department", name: "Administration", code: "ADMINISTRATION" };
  const db = mockDatabase({ departments: [department] });
  await bootstrap.bootstrapInitialAdmin(db.client, details);
  assert.equal(db.state().departments.length, 1);
  assert.equal(db.state().users[0].departmentId, department.id);
  for (const conflicting of [{ ...department, code: "OTHER" }, { ...department, name: "Other" }]) {
    const conflict = mockDatabase({ departments: [conflicting] });
    await assert.rejects(bootstrap.bootstrapInitialAdmin(conflict.client, details), /department name\/code conflicts/);
    assert.equal(conflict.state().users.length, 0);
  }
});

test("user creation failure rolls back the department and discloses no password result", async () => {
  const db = mockDatabase({ users: [{ employeeId: "EMP001", email: details.email, role: "EMPLOYEE" }] });
  const before = structuredClone(db.state());
  await assert.rejects(bootstrap.bootstrapInitialAdmin(db.client, details));
  assert.deepEqual(db.state(), before);
  assert.ok(!db.events.includes("commit"));
});

test("concurrent simulated bootstrap attempts produce one success and one rejection", async () => {
  const db = mockDatabase();
  const results = await Promise.allSettled([
    bootstrap.bootstrapInitialAdmin(db.client, details),
    bootstrap.bootstrapInitialAdmin(db.client, details),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(db.state().users.length, 1);
  assert.equal(db.state().departments.length, 1);
});

test("CLI help loads the real runner without requiring database configuration", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "scripts/run-admin-bootstrap.mjs", "--help",
  ], {
    encoding: "utf8", timeout: 15000,
    env: { ...process.env, DATABASE_URL: "", AUTH_SECRET: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: npm run admin:bootstrap/);
  assert.ok(!result.stdout.includes("Temporary password (shown once)"));
});

test("real CLI refuses redirected execution before loading the database client", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "scripts/run-admin-bootstrap.mjs",
    "--name", details.name, "--email", details.email,
  ], {
    encoding: "utf8", timeout: 15000,
    env: { ...process.env, DATABASE_URL: "", AUTH_SECRET: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires a private interactive terminal/);
  assert.equal(result.stdout, "");
});
