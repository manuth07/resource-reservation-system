import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash, argon2id } from "argon2";
import { resourceServiceFor } from "./helpers/resources.mjs";

const url = process.env.TEST_DATABASE_URL;
test("dedicated PostgreSQL resource/category CRUD, literal searches and history protection (rollback only)", { skip: !url }, async () => {
  try {
    const target = new URL(url);
    assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
    assert.match(decodeURIComponent(target.pathname), /_test$/);
    if (process.env.DATABASE_URL) {
      const main = new URL(process.env.DATABASE_URL);
      assert.notEqual(`${target.hostname}:${target.port || "5432"}${target.pathname}`, `${main.hostname}:${main.port || "5432"}${main.pathname}`);
    }
  } catch { throw new Error("Export a distinct dedicated PostgreSQL URL ending in _test; inspect configuration privately."); }
  const jiti = createJiti(import.meta.url, { alias: { "server-only": fileURLToPath(new URL("../node_modules/server-only/empty.js", import.meta.url)) } });
  const { PrismaClient } = await jiti.import(fileURLToPath(new URL("../src/generated/prisma/client.ts", import.meta.url)));
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const rollback = new Error("Intentional fixture rollback");
  try {
    await client.$transaction(async (tx) => {
      const suffix = randomUUID().replaceAll("-", "");
      const department = await tx.department.create({ data: { code: `TEST_${suffix}`, name: `Test ${suffix}` } });
      const actor = await tx.user.create({ data: { employeeId: `TEST_${suffix}`, email: `${suffix}@example.invalid`, name: "Resource Integration Admin", departmentId: department.id, role: "ADMIN", accountStatus: "ACTIVE", mustChangePassword: false, passwordHash: await hash("Dedicated-test-fixture-password-2026", { type: argon2id }) } });
      const facade = { user: tx.user, resource: tx.resource, resourceCategory: tx.resourceCategory, reservation: tx.reservation, $transaction: (arg) => Array.isArray(arg) ? Promise.all(arg) : arg(tx) };
      const service = resourceServiceFor(facade, { requireRole: async () => actor, requireAuthenticatedUser: async () => actor, AuthorizationError: class extends Error {} });
      const categoryData = { code: `ROOM_${suffix}`, name: `Rooms ${suffix}`, description: "Integration fixture", isVehicle: false };
      const category = await service.saveCategory(categoryData);
      const row = await tx.resourceCategory.findUniqueOrThrow({ where: { id: category.id } });
      await tx.resourceCategory.update({ where: { id: row.id }, data: { metadata: { preserved: true } } });
      const revision = (await tx.resourceCategory.findUniqueOrThrow({ where: { id: row.id } })).updatedAt.toISOString();
      await service.saveCategory({ ...categoryData, description: "Updated" }, row.id, revision);
      assert.equal((await tx.resourceCategory.findUniqueOrThrow({ where: { id: row.id } })).metadata.preserved, true);
      await assert.rejects(service.saveCategory({ ...categoryData, code: categoryData.code.toLowerCase() }), /already in use/);
      const resourceData = { name: `Fixture ${suffix} 100%_A\\B`, resourceCode: `RESOURCE_${suffix}`, categoryId: row.id, capacity: "12", location: "Test floor", isActive: true, requiresApproval: false };
      const created = await service.saveResource(resourceData);
      await assert.rejects(service.saveResource({ ...resourceData, resourceCode: resourceData.resourceCode.toLowerCase() }), /already in use/);
      assert.equal((await service.listResources({ q: "100%_a\\b", category: row.id })).total, 1);
      assert.equal((await service.listResources({ q: "100X_A\\B", category: row.id })).total, 0);
      let resource = await tx.resource.findUniqueOrThrow({ where: { id: created.id } });
      await tx.reservation.create({ data: { requesterId: actor.id, departmentId: department.id, requestedCategoryId: row.id, resourceId: resource.id, startTime: new Date("2030-01-01T09:00:00Z"), endTime: new Date("2030-01-01T10:00:00Z"), purpose: "Isolated integration test", status: "CONFIRMED" } });
      await assert.rejects(service.saveResource({ ...resourceData, requiresApproval: true }, resource.id, resource.updatedAt.toISOString()), /history/);
      const categoryRevision = (await tx.resourceCategory.findUniqueOrThrow({ where: { id: row.id } })).updatedAt.toISOString();
      await assert.rejects(service.saveCategory({ ...categoryData, isVehicle: true }, row.id, categoryRevision), /Referenced categories/);
      await service.setResourceActive(resource.id, false, resource.updatedAt.toISOString());
      resource = await tx.resource.findUniqueOrThrow({ where: { id: resource.id } });
      assert.equal(resource.isActive, false);
      assert.equal((await service.listResources({ category: row.id, status: "INACTIVE" })).total, 1);
      assert.equal(await tx.reservation.count({ where: { resourceId: resource.id } }), 1);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw new Error("Dedicated resource integration check failed; inspect setup privately. Writes are transaction-scoped.");
  } finally {
    try { await client.$disconnect(); } catch { throw new Error("Test database disconnect failed; inspect setup privately."); }
  }
});
