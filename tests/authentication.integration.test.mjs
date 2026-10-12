import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { serviceFor, passwords, enums, oldPassword } from "./helpers/accounts.mjs";

const url = process.env.TEST_DATABASE_URL;
function databaseAddress(value) {
  try {
    const parsed = new URL(value);
    assert.ok(["postgres:", "postgresql:"].includes(parsed.protocol));
    return parsed;
  } catch {
    throw new Error("Invalid database URL configuration; inspect it privately.");
  }
}
test("PostgreSQL account provisioning, HOD assignment and version-revoking password change (rollback only)", { skip: !url }, async () => {
  const target = databaseAddress(url);
  assert.match(decodeURIComponent(target.pathname), /_test$/);
  if (process.env.DATABASE_URL) {
    const main = databaseAddress(process.env.DATABASE_URL);
    assert.notEqual(`${target.hostname}:${target.port || "5432"}${target.pathname}`, `${main.hostname}:${main.port || "5432"}${main.pathname}`, "Test database must differ from the application database");
  }
  const jiti = createJiti(import.meta.url, { alias: { "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)) } });
  const { PrismaClient } = await jiti.import(fileURLToPath(new URL("../src/generated/prisma/client.ts", import.meta.url)));
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const rollback = new Error("Intentional test rollback");
  try {
    await client.$transaction(async (tx) => {
      const suffix = randomUUID().replaceAll("-", "");
      const department = await tx.department.create({ data: { name: `Test ${suffix}`, code: `TEST_${suffix}` } });
      const actor = await tx.user.create({ data: {
        employeeId: `TEST_ADMIN_${suffix}`, name: "Integration Admin", email: `${suffix}@admin.example.invalid`,
        role: enums.UserRole.ADMIN, accountStatus: enums.AccountStatus.ACTIVE, departmentId: department.id,
        passwordHash: await passwords.hashTemporaryPassword(oldPassword), mustChangePassword: false, sessionVersion: 0,
      } });
      let identity = actor;
      const facade = { $transaction: (fn) => fn(tx) };
      const service = serviceFor(facade, {
        getAuthenticatedUser: async () => identity,
        requireRole: async () => actor,
        AuthorizationError: class extends Error {},
      });
      const input = { employeeId: ` emp_${suffix} `, name: "Integration Employee", email: `${suffix}@employee.example.invalid`, departmentId: department.id, role: "DEPARTMENT_HEAD" };
      const created = await service.createEmployee(input);
      const employee = await tx.user.findUniqueOrThrow({ where: { employeeId: created.employeeId } });
      assert.equal((await tx.department.findUniqueOrThrow({ where: { id: department.id } })).headId, employee.id);
      assert.equal(await passwords.verifyPassword(employee.passwordHash, created.temporaryPassword), true);
      await assert.rejects(service.createEmployee({ ...input, employeeId: input.employeeId.toLowerCase() }), /already in use/);
      identity = employee;
      const nextPassword = "Integration-new-password-2026";
      await service.changeOwnPassword({ currentPassword: created.temporaryPassword, newPassword: nextPassword, confirmPassword: nextPassword });
      const changed = await tx.user.findUniqueOrThrow({ where: { id: employee.id } });
      assert.equal(changed.sessionVersion, 1);
      assert.equal(changed.mustChangePassword, false);
      assert.equal(await passwords.verifyPassword(changed.passwordHash, nextPassword), true);
      await assert.rejects(service.changeOwnPassword({ currentPassword: nextPassword, newPassword: "Another-new-password-2026", confirmPassword: "Another-new-password-2026" }));
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw new Error("Dedicated PostgreSQL integration check failed; inspect test setup privately. All test writes are transaction-scoped.");
  } finally {
    try { await client.$disconnect(); }
    catch { throw new Error("Dedicated test database disconnect failed; inspect setup privately."); }
  }
});
