import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./helpers/source.mjs";
import { resourceFixture, resourceInput, categoryInput, resourceId, timestamp, resourceValidation } from "./helpers/resources.mjs";

function form(values) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, String(value)); return data; }
class RedirectSignal extends Error {}
function actionsFor(fixture) {
  const paths = [];
  const actions = loadSource("src/app/resource-actions.ts", {
    "next/cache": { revalidatePath: (...args) => paths.push(args) },
    "next/navigation": { redirect: (path) => { throw new RedirectSignal(path); } },
    "@/lib/authorization": fixture.authorization,
    "@/lib/rate-limit": { RateLimitError: class extends Error {} },
    "@/lib/resource-validation": resourceValidation,
    "@/lib/resource-service": fixture.service,
  });
  return { actions, paths };
}
test("resource Server Action saves only supported fields and redirects to a fixed Admin path", async () => {
  const fixture = resourceFixture({ empty: true });
  const { actions, paths } = actionsFor(fixture);
  await assert.rejects(actions.saveResourceAction({}, form({ ...resourceInput, role: "ADMIN", userId: "forged", callbackUrl: "https://example.invalid" })), (error) => error instanceof RedirectSignal && error.message === "/admin/resources?saved=1");
  assert.equal(fixture.state().resources[0].role, undefined);
  assert.ok(paths.some(([path]) => path === "/resources"));
});
test("forged client role does not authorize Employee, unauthenticated or first-login Server Action mutations", async () => {
  for (const options of [{ actor: { role: "EMPLOYEE" } }, { unauthenticated: true }, { actor: { mustChangePassword: true } }, { actor: { accountStatus: "INACTIVE" } }]) {
    const fixture = resourceFixture(options);
    const { actions } = actionsFor(fixture);
    const result = await actions.saveResourceAction({}, form({ ...resourceInput, resourceCode: "OTHER", role: "ADMIN" }));
    assert.match(result.error, /session cannot perform/);
    const categoryResult = await actions.saveCategoryAction({}, form(categoryInput));
    assert.match(categoryResult.error, /session cannot perform/);
    const statusResult = await actions.setResourceActiveAction(form({ id: resourceId, active: false, updatedAt: timestamp }));
    assert.match(statusResult.error, /session cannot perform/);
    assert.equal(fixture.state().resources.length, 1);
  }
});
test("status action revalidates committed writes and returns stale/invalid-input errors safely", async () => {
  const fixture = resourceFixture();
  const { actions, paths } = actionsFor(fixture);
  assert.deepEqual(Object.keys(await actions.setResourceActiveAction(form({ id: resourceId, active: false, updatedAt: timestamp }))), []);
  assert.equal(fixture.state().resources[0].isActive, false); assert.ok(paths.length);
  assert.match((await actions.setResourceActiveAction(form({ id: resourceId, active: true, updatedAt: timestamp }))).error, /changed by another/);
  assert.match((await actions.setResourceActiveAction(form({ id: resourceId, active: "anything", updatedAt: timestamp }))).error, /valid option/);
});
test("category actions use fixed redirects; unexpected backend failures expose no raw details", async () => {
  const fixture = resourceFixture({ empty: true });
  const { actions } = actionsFor(fixture);
  await assert.rejects(actions.saveCategoryAction({}, form({ ...categoryInput, code: "PROJECTOR", name: "Projectors" })), (error) => error instanceof RedirectSignal && error.message === "/admin/resource-categories?saved=1");
  const failing = resourceFixture(); failing.service.saveResource = async () => { throw new Error("postgres://private-credentials invalid-query"); };
  const result = await actionsFor(failing).actions.saveResourceAction({}, form(resourceInput));
  assert.equal(result.error.includes("postgres"), false); assert.match(result.error, /could not be completed/);
});

test("actions return associated inline duplicate-code errors without losing the submitted values", async () => {
  const { actions } = actionsFor(resourceFixture());
  const resource = await actions.saveResourceAction({}, form(resourceInput));
  assert.equal(resource.fieldErrors.resourceCode, "Resource code ROOM_001 is already in use. Enter a unique code.");
  const category = await actions.saveCategoryAction({}, form({ ...categoryInput, name: "Other category" }));
  assert.equal(category.fieldErrors.code, "Category code MEETING_ROOM is already in use. Enter a unique code.");
});
