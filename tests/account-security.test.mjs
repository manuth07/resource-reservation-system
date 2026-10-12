import assert from "node:assert/strict";
import test from "node:test";
import { accountFixture, actorId, departmentId, oldPassword, passwords } from "./helpers/accounts.mjs";

const passwordInput = { currentPassword: oldPassword, newPassword: "New-fixture-password-2026", confirmPassword: "New-fixture-password-2026" };
const employeeInput = { employeeId: " emp_001 ", name: " Fixture Employee ", email: "Employee@Example.Invalid", departmentId, role: "EMPLOYEE" };

test("first-login password change atomically updates the hash, clears the flag and revokes the session", async () => {
  const fixture = accountFixture({ actor: { mustChangePassword: true } });
  await assert.rejects(fixture.authorization.requireAuthenticatedUser(), { code: "PASSWORD_CHANGE_REQUIRED" });
  await fixture.service.changeOwnPassword(passwordInput);
  const user = fixture.state().users[0];
  assert.equal(user.mustChangePassword, false);
  assert.equal(user.sessionVersion, 1);
  assert.equal(await passwords.verifyPassword(user.passwordHash, passwordInput.newPassword), true);
  assert.equal(await passwords.verifyPassword(user.passwordHash, oldPassword), false);
  assert.equal(await fixture.authorization.getAuthenticatedUser(), null);
  fixture.session({ user: { id: actorId, sessionVersion: 1 } });
  assert.equal((await fixture.authorization.requireAuthenticatedUser()).id, actorId);
});

test("wrong current password, weak password, reuse and mismatched confirmation do not modify data", async () => {
  for (const input of [
    { ...passwordInput, currentPassword: "wrong" },
    { ...passwordInput, newPassword: "short", confirmPassword: "short" },
    { ...passwordInput, newPassword: "longpasswordwithoutdigits", confirmPassword: "longpasswordwithoutdigits" },
    { ...passwordInput, newPassword: oldPassword, confirmPassword: oldPassword },
    { ...passwordInput, confirmPassword: "different" },
  ]) {
    const fixture = accountFixture();
    const before = structuredClone(fixture.state());
    await assert.rejects(fixture.service.changeOwnPassword(input));
    assert.deepEqual(fixture.state(), before);
  }
});

test("missing, mismatched, negative and fractional session versions are rejected", async () => {
  const fixture = accountFixture();
  for (const sessionVersion of [undefined, 1, -1, 0.5]) {
    fixture.session({ user: { id: actorId, sessionVersion } });
    assert.equal(await fixture.authorization.getAuthenticatedUser(), null);
    await assert.rejects(fixture.service.changeOwnPassword(passwordInput), { code: "UNAUTHENTICATED" });
  }
});

test("concurrent simulated password changes accept only one old-version update", async () => {
  const fixture = accountFixture();
  const results = await Promise.allSettled([fixture.service.changeOwnPassword(passwordInput), fixture.service.changeOwnPassword(passwordInput)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(fixture.state().users[0].sessionVersion, 1);
});

test("employee creation normalizes identifiers, stores only a hash and returns one-time credentials", async () => {
  const fixture = accountFixture();
  const result = await fixture.service.createEmployee(employeeInput);
  const employee = fixture.state().users[1];
  assert.equal(employee.employeeId, "EMP_001");
  assert.equal(employee.email, "employee@example.invalid");
  assert.equal(employee.mustChangePassword, true);
  assert.equal(employee.accountStatus, "ACTIVE");
  assert.equal(employee.sessionVersion, 0);
  assert.equal(await passwords.verifyPassword(employee.passwordHash, result.temporaryPassword), true);
  assert.ok(!JSON.stringify(fixture.state()).includes(result.temporaryPassword));
  assert.deepEqual(Object.keys(result).sort(), ["employeeId", "temporaryPassword"]);
});

test("unauthenticated, non-Admin, inactive and password-change-only actors cannot provision accounts", async () => {
  for (const options of [{ unauthenticated: true }, { actor: { role: "EMPLOYEE" } }, { actor: { role: "DEPARTMENT_HEAD" } }, { actor: { mustChangePassword: true } }, { actor: { accountStatus: "INACTIVE" } }]) {
    const fixture = accountFixture(options);
    const before = structuredClone(fixture.state());
    await assert.rejects(fixture.service.createEmployee(employeeInput));
    assert.deepEqual(fixture.state(), before);
  }
});

test("Admin authorization is rechecked inside the provisioning transaction", async () => {
  const fixture = accountFixture({ beforeTransaction: (state) => { state.users[0].role = "EMPLOYEE"; } });
  await assert.rejects(fixture.service.createEmployee(employeeInput), { code: "FORBIDDEN" });
  assert.equal(fixture.state().users.length, 1);
});

test("duplicate case-insensitive employee IDs/emails and malformed inputs are rejected", async () => {
  for (const employee of [{ employeeId: "emp_001", email: "other@example.invalid" }, { employeeId: "OTHER", email: "EMPLOYEE@EXAMPLE.INVALID" }]) {
    const fixture = accountFixture({ users: [{ ...employee, id: "existing", role: "EMPLOYEE" }] });
    await assert.rejects(fixture.service.createEmployee(employeeInput), /already in use/);
    assert.equal(fixture.state().users.length, 2);
  }
  for (const override of [{ employeeId: "EMP%001" }, { employeeId: "_bad" }, { role: "ADMIN" }, { email: "invalid" }, { departmentId: "invalid" }]) {
    const fixture = accountFixture();
    await assert.rejects(fixture.service.createEmployee({ ...employeeInput, ...override }));
    assert.equal(fixture.state().users.length, 1);
  }
});

test("HOD creation designates the correct department and rejects occupied head positions", async () => {
  const fixture = accountFixture();
  await fixture.service.createEmployee({ ...employeeInput, role: "DEPARTMENT_HEAD" });
  assert.equal(fixture.state().departments[0].headId, fixture.state().users[1].id);
  assert.equal(fixture.state().users[1].departmentId, departmentId);
  const occupied = accountFixture({ department: { headId: "existing-head" } });
  await assert.rejects(occupied.service.createEmployee({ ...employeeInput, role: "DEPARTMENT_HEAD" }), /already has/);
  const failed = accountFixture({ failDepartmentUpdate: true });
  await assert.rejects(failed.service.createEmployee({ ...employeeInput, role: "DEPARTMENT_HEAD" }));
  assert.equal(failed.state().users.length, 1);
  assert.equal(failed.state().departments[0].headId, null);
});

test("credential reset increments session version, forces password change, and cannot reset an Admin", async () => {
  const fixture = accountFixture();
  await fixture.service.createEmployee(employeeInput);
  const id = fixture.state().users[1].id;
  const oldHash = fixture.state().users[1].passwordHash;
  const result = await fixture.service.resetEmployeeCredentials(id);
  const employee = fixture.state().users[1];
  assert.equal(employee.sessionVersion, 1);
  assert.equal(employee.mustChangePassword, true);
  assert.notEqual(employee.passwordHash, oldHash);
  assert.equal(await passwords.verifyPassword(employee.passwordHash, result.temporaryPassword), true);
  await assert.rejects(fixture.service.resetEmployeeCredentials(actorId), /Only employee/);
});

test("rate-limited mutations fail before modifying accounts", async () => {
  const fixture = accountFixture();
  fixture.limit();
  await assert.rejects(fixture.service.changeOwnPassword(passwordInput), /Rate limited/);
  await assert.rejects(fixture.service.createEmployee(employeeInput), /Rate limited/);
  assert.equal(fixture.state().users.length, 1);
  assert.equal(fixture.state().users[0].sessionVersion, 0);
});
