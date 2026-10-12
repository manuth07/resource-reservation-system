import "server-only";
import { AccountStatus, UserRole, type Prisma } from "@/generated/prisma/client";
import { getAuthenticatedUser, requireRole, AuthorizationError } from "@/lib/authorization";
import { normalizeEmployeeId } from "@/lib/credentials";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateTemporaryPassword, hashTemporaryPassword, verifyPassword, passwordPolicyError } from "@/lib/passwords";

export class AccountOperationError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function changeOwnPassword(input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  const actor = await getAuthenticatedUser();
  if (!actor) throw new AuthorizationError("UNAUTHENTICATED", 401);
  await enforceRateLimit("password-change", actor.id, 5, 15 * 60_000);
  if (!input.currentPassword || input.currentPassword.length > 1024) throw new AccountOperationError("Enter your current password.");
  const policy = passwordPolicyError(input.newPassword);
  if (policy) throw new AccountOperationError(policy);
  if (input.newPassword !== input.confirmPassword) throw new AccountOperationError("The new passwords do not match.");
  const passwordHash = await hashTemporaryPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true, sessionVersion: true, accountStatus: true } });
    if (!user || user.accountStatus !== AccountStatus.ACTIVE || user.sessionVersion !== actor.sessionVersion) throw new AuthorizationError("UNAUTHENTICATED", 401);
    if (!await verifyPassword(user.passwordHash, input.currentPassword)) throw new AccountOperationError("The current password is incorrect.");
    if (await verifyPassword(user.passwordHash, input.newPassword)) throw new AccountOperationError("Choose a password different from your current password.");
    const updated = await tx.user.updateMany({
      where: { id: actor.id, accountStatus: AccountStatus.ACTIVE, sessionVersion: actor.sessionVersion, passwordHash: user.passwordHash },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) throw new AuthorizationError("UNAUTHENTICATED", 401);
  }, { timeout: 15000 });
}

async function checkAdminInTransaction(tx: Prisma.TransactionClient, actor: { id: string; sessionVersion: number }) {
  await tx.$executeRaw`SELECT "id" FROM "public"."User" WHERE "id" = ${actor.id}::uuid FOR UPDATE`;
  const current = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, accountStatus: true, mustChangePassword: true, sessionVersion: true } });
  if (!current || current.accountStatus !== AccountStatus.ACTIVE || current.mustChangePassword || current.role !== UserRole.ADMIN || current.sessionVersion !== actor.sessionVersion) throw new AuthorizationError("FORBIDDEN", 403);
}

export async function createEmployee(input: { employeeId: string; name: string; email: string; departmentId: string; role: string }) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("employee-provisioning", actor.id, 20, 60 * 60_000);
  const employeeId = normalizeEmployeeId(input.employeeId);
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(employeeId)) throw new AccountOperationError("Employee ID must be 2–64 letters, numbers, hyphens or underscores, starting with a letter or number.");
  if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !uuid.test(input.departmentId)) throw new AccountOperationError("Enter a valid name, email and department.");
  if (input.role !== UserRole.EMPLOYEE && input.role !== UserRole.DEPARTMENT_HEAD) throw new AccountOperationError("Choose Employee or Department Head.");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashTemporaryPassword(temporaryPassword);
  await prisma.$transaction(async (tx) => {
    // All provisioning/reset handlers serialize here, including across instances.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(742019, 2)`;
    await checkAdminInTransaction(tx, actor);
    const duplicate = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."User"
      WHERE upper("employeeId") = ${employeeId} OR lower("email") = ${email} LIMIT 1
    `;
    if (duplicate.length) throw new AccountOperationError("An employee ID or email is already in use.");
    await tx.$executeRaw`SELECT "id" FROM "public"."Department" WHERE "id" = ${input.departmentId}::uuid FOR UPDATE`;
    const department = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true, headId: true } });
    if (!department) throw new AccountOperationError("Choose an existing department.");
    if (input.role === UserRole.DEPARTMENT_HEAD && department.headId) throw new AccountOperationError("This department already has a designated head.");
    const user = await tx.user.create({ data: {
      employeeId, name, email, departmentId: department.id, role: input.role as "EMPLOYEE" | "DEPARTMENT_HEAD",
      passwordHash, accountStatus: AccountStatus.ACTIVE, mustChangePassword: true, sessionVersion: 0,
    }, select: { id: true } });
    if (input.role === UserRole.DEPARTMENT_HEAD) await tx.department.update({ where: { id: department.id }, data: { headId: user.id } });
  }, { timeout: 15000 });
  return { employeeId, temporaryPassword };
}

export async function resetEmployeeCredentials(targetId: string) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("employee-reset", actor.id, 10, 60 * 60_000);
  if (!uuid.test(targetId)) throw new AccountOperationError("Choose an employee account.");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashTemporaryPassword(temporaryPassword);
  const employeeId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(742019, 2)`;
    await checkAdminInTransaction(tx, actor);
    await tx.$executeRaw`SELECT "id" FROM "public"."User" WHERE "id" = ${targetId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: targetId }, select: { role: true, employeeId: true } });
    if (!user || user.role === UserRole.ADMIN) throw new AccountOperationError("Only employee and department-head credentials can be reset here.");
    await tx.user.update({ where: { id: targetId }, data: { passwordHash, mustChangePassword: true, sessionVersion: { increment: 1 } } });
    return user.employeeId;
  }, { timeout: 15000 });
  return { employeeId, temporaryPassword };
}
