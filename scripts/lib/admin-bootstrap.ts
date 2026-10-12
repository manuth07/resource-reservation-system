import "server-only";

import { generateTemporaryPassword, hashTemporaryPassword } from "../../src/lib/passwords";
export { generateTemporaryPassword, hashTemporaryPassword } from "../../src/lib/passwords";
import { AccountStatus, Prisma, UserRole, type PrismaClient } from "../../src/generated/prisma/client";

export const BOOTSTRAP_EMPLOYEE_ID = "ADMIN001";
const DEPARTMENT_CODE = "ADMINISTRATION";
const DEPARTMENT_NAME = "Administration";

export class AdminBootstrapError extends Error {}

export async function bootstrapInitialAdmin(
  prisma: PrismaClient,
  details: { name: string; email: string },
) {
  const name = details.name.trim();
  const email = details.email.trim().toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminBootstrapError("Supply a non-empty name and a valid organizational email.");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashTemporaryPassword(temporaryPassword);

  const admin = await prisma.$transaction(async (tx) => {
    // All invocations of this command use the same transaction-scoped lock.
    // ReadCommitted ensures a waiter sees the preceding transaction's commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(742019, 1)`;

    if (await tx.user.findFirst({ where: { role: UserRole.ADMIN }, select: { id: true } })) {
      throw new AdminBootstrapError("Bootstrap refused: an administrator account already exists, including inactive accounts.");
    }

    const existingIds = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."User"
      WHERE upper("employeeId") = ${BOOTSTRAP_EMPLOYEE_ID}
      LIMIT 1
    `;
    if (existingIds.length) {
      throw new AdminBootstrapError("Bootstrap refused: the reserved employee ID is already in use.");
    }

    const departments = await tx.department.findMany({
      where: { OR: [{ code: DEPARTMENT_CODE }, { name: DEPARTMENT_NAME }] },
      select: { id: true, code: true, name: true },
      take: 2,
    });
    if (departments.length > 1 || (departments[0] && (
      departments[0].code !== DEPARTMENT_CODE || departments[0].name !== DEPARTMENT_NAME
    ))) {
      throw new AdminBootstrapError("Bootstrap refused: Administration department name/code conflicts with existing data.");
    }

    const department = departments[0] ?? await tx.department.create({
      data: { name: DEPARTMENT_NAME, code: DEPARTMENT_CODE, description: "Organizational administration" },
      select: { id: true },
    });

    return tx.user.create({
      data: {
        employeeId: BOOTSTRAP_EMPLOYEE_ID,
        name,
        email,
        passwordHash,
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        mustChangePassword: true,
        departmentId: department.id,
      },
      select: { id: true, employeeId: true },
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5000,
    timeout: 30000,
  });

  // Nothing receives the plaintext unless the transaction committed successfully.
  return { employeeId: admin.employeeId, temporaryPassword };
}
