import assert from "node:assert/strict";
import test from "node:test";
import { resourceFixture, resourceInput, categoryInput, categoryId, resourceId, timestamp, resourceValidation } from "./helpers/resources.mjs";

test("Admin creates canonical resource codes and optional fields with the existing category", async () => {
  const f = resourceFixture({ empty: true });
  await f.service.saveResource({ ...resourceInput, resourceCode: " room_002 ", capacity: "", location: " " });
  const row = f.state().resources[0];
  assert.equal(row.resourceCode, "ROOM_002"); assert.equal(row.capacity, null); assert.equal(row.location, null); assert.equal(row.categoryId, categoryId);
  assert.ok(f.trace.some((sql) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(f.trace.some((sql) => sql.includes('"ResourceCategory"') && sql.includes("FOR UPDATE")));
});
test("employees/HOD may browse active and inactive resources but cannot create, edit, toggle or manage categories", async () => {
  for (const role of ["EMPLOYEE", "DEPARTMENT_HEAD"]) {
    const f = resourceFixture({ actor: { role }, resource: { isActive: false } });
    assert.equal((await f.service.listResources({})).resources[0].isActive, false);
    assert.equal((await f.service.getResource(resourceId)).name, resourceInput.name);
    for (const operation of [() => f.service.saveResource(resourceInput), () => f.service.saveResource(resourceInput, resourceId, timestamp), () => f.service.setResourceActive(resourceId, false, timestamp), () => f.service.saveCategory(categoryInput), () => f.service.listCategories(), () => f.service.listResources({}, true), () => f.service.getResourceForEdit(resourceId)]) await assert.rejects(operation, /FORBIDDEN/);
    assert.equal(f.state().resources.length, 1);
  }
});
test("unauthenticated, inactive, stale-version and first-login users cannot access resources", async () => {
  for (const options of [{ unauthenticated: true }, { actor: { accountStatus: "INACTIVE" } }, { actor: { sessionVersion: 1 } }, { actor: { mustChangePassword: true } }]) {
    const f = resourceFixture(options);
    await assert.rejects(f.service.listResources({})); await assert.rejects(f.service.saveResource(resourceInput));
    assert.equal(f.state().resources.length, 1);
  }
});
test("invalid data, UUIDs, categories and vehicle direct-booking policies reject without writes", async () => {
  const f = resourceFixture();
  for (const overrides of [{ capacity: "0" }, { capacity: "-1" }, { capacity: "1.5" }, { capacity: "2147483648" }, { resourceCode: "%bad" }, { name: " " }, { location: "x".repeat(201) }, { categoryId: "invalid" }, { isActive: "true" }]) await assert.rejects(f.service.saveResource({ ...resourceInput, resourceCode: "OTHER", ...overrides }));
  await assert.rejects(f.service.saveResource({ ...resourceInput, resourceCode: "OTHER", categoryId: "72608788-dd2d-487a-a49a-619dc7ebf560" }), /existing category/);
  const vehicle = resourceFixture({ empty: true, category: { isVehicle: true } });
  await assert.rejects(vehicle.service.saveResource(resourceInput), /Vehicles must require approval/);
  await vehicle.service.saveResource({ ...resourceInput, requiresApproval: true });
  assert.equal(vehicle.state().resources[0].requiresApproval, true);
});
test("canonical duplicate category codes/names and resource codes reject, including legacy casing", async () => {
  const f = resourceFixture({ category: { code: "meeting_room" }, resource: { resourceCode: "room_001" } });
  await assert.rejects(f.service.saveResource(resourceInput), /code is already in use/);
  await assert.rejects(f.service.saveCategory({ ...categoryInput, name: "Another" }), /already in use/);
  await assert.rejects(f.service.saveCategory({ ...categoryInput, code: "OTHER", name: " meeting ROOMS " }), /already in use/);
});
test("two simulated concurrent canonical-code creations produce only one record", async () => {
  const f = resourceFixture({ empty: true });
  const results = await Promise.allSettled([f.service.saveResource(resourceInput), f.service.saveResource({ ...resourceInput, resourceCode: "room_001" })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(f.state().resources.length, 1);
});
test("category edits preserve metadata and protect classification/code for resource or reservation references", async () => {
  const f = resourceFixture();
  await assert.rejects(f.service.saveCategory({ ...categoryInput, isVehicle: true }, categoryId, timestamp), /Referenced categories/);
  await assert.rejects(f.service.saveCategory({ ...categoryInput, code: "OTHER" }, categoryId, timestamp), /Referenced categories/);
  await f.service.saveCategory({ ...categoryInput, name: "Room spaces", description: "Updated" }, categoryId, timestamp);
  assert.equal(f.state().categories[0].metadata.retained, true);
  const legacy = resourceFixture({ category: { code: "meeting_room" } });
  await legacy.service.saveCategory({ ...categoryInput, name: "Updated legacy category" }, categoryId, timestamp);
  assert.equal(legacy.state().categories[0].code, "meeting_room");
  const history = resourceFixture({ empty: true, reservations: [{ requestedCategoryId: categoryId, resourceId: null }] });
  await assert.rejects(history.service.saveCategory({ ...categoryInput, isVehicle: true }, categoryId, timestamp), /Referenced categories/);
  const unused = resourceFixture({ empty: true });
  await unused.service.saveCategory({ ...categoryInput, isVehicle: true }, categoryId, timestamp);
  assert.equal(unused.state().categories[0].isVehicle, true);
});
test("reservation history locks approval/category policy while retaining editable operational details", async () => {
  for (const reservation of [{ requestedCategoryId: categoryId, resourceId }, { requestedCategoryId: categoryId, resourceId: null }]) {
    const f = resourceFixture({ reservations: [reservation], categories: [{ id: "a380cfcb-66e0-4a66-b4bc-a4265ebc60e6", ...categoryInput, code: "PROJECTOR", name: "Projectors", updatedAt: new Date(timestamp) }] });
    await assert.rejects(f.service.saveResource({ ...resourceInput, requiresApproval: true }, resourceId, timestamp), /history|category-only/);
    await assert.rejects(f.service.saveResource({ ...resourceInput, categoryId: "a380cfcb-66e0-4a66-b4bc-a4265ebc60e6" }, resourceId, timestamp), /history|category-only/);
    await f.service.saveResource({ ...resourceInput, name: "Renamed room", capacity: "20", isActive: false }, resourceId, timestamp);
    assert.equal(f.state().reservations.length, 1); assert.equal(f.state().resources[0].isActive, false); assert.equal(f.state().resources[0].capacity, 20);
  }
  const free = resourceFixture(); await free.service.saveResource({ ...resourceInput, requiresApproval: true }, resourceId, timestamp); assert.equal(free.state().resources[0].requiresApproval, true);
});
test("activation/deactivation preserves history and rejects stale or nonexistent records", async () => {
  const f = resourceFixture({ reservations: [{ requestedCategoryId: categoryId, resourceId }] });
  await f.service.setResourceActive(resourceId, false, timestamp);
  assert.equal(f.state().resources[0].isActive, false); assert.equal(f.state().reservations.length, 1);
  await assert.rejects(f.service.setResourceActive(resourceId, true, timestamp), /changed by another/);
  await f.service.setResourceActive(resourceId, true, f.state().resources[0].updatedAt.toISOString());
  await assert.rejects(f.service.setResourceActive("invalid", false, timestamp), /valid record/);
  await assert.rejects(f.service.setResourceActive("a380cfcb-66e0-4a66-b4bc-a4265ebc60e6", false, timestamp), /not found/);
});
test("mutation rechecks Admin status/version under lock and database errors are sanitized", async () => {
  for (const change of [{ role: "EMPLOYEE" }, { accountStatus: "INACTIVE" }, { sessionVersion: 1 }, { mustChangePassword: true }]) {
    const f = resourceFixture({ beforeTransaction: (state) => Object.assign(state.users[0], change) });
    await assert.rejects(f.service.saveResource({ ...resourceInput, resourceCode: "OTHER" }), /FORBIDDEN/);
    assert.equal(f.state().resources.length, 1);
  }
  for (const code of ["P2002", "P2003", "P2025", "P2034", "P2028"]) {
    const f = resourceFixture({ failWrite: code });
    await assert.rejects(f.service.saveResource({ ...resourceInput, resourceCode: "OTHER" }), (error) => error instanceof resourceValidation.ResourceManagementError && !error.message.includes(code));
  }
  const limited = resourceFixture(); limited.limit(); await assert.rejects(limited.service.saveResource(resourceInput), /Rate limited/);
});
test("searches are literal and case-insensitive; category/status filters and invalid filters are handled", async () => {
  const f = resourceFixture({ resource: { name: "Room 100%_A\\B" } });
  assert.equal((await f.service.listResources({ q: "100%_a\\b", category: categoryId, status: "ACTIVE" })).total, 1);
  assert.equal((await f.service.listResources({ q: "not there" })).total, 0);
  assert.equal((await f.service.listResources({ status: "INACTIVE" })).total, 0);
  for (const filters of [{ category: "bad" }, { status: "available" }, { page: "-1" }, { page: "100001" }, { q: "x".repeat(101) }, { status: ["ACTIVE", "INACTIVE"] }]) await assert.rejects(f.service.listResources(filters));
  assert.equal(await f.service.getResource("bad"), null);
  assert.equal(await f.service.getCategory("bad"), null);
});
