import "server-only";

import { AccountStatus, Prisma, UserRole } from "@/generated/prisma/client";
import { AuthorizationError, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import type {
  CreateDepartmentInput,
  DepartmentDetailRecord,
  DepartmentRecord,
  EmployeeTransferInput,
  UpdateDepartmentInput,
} from "@/lib/department-types";
import {
  DepartmentError,
  isValidUuid,
  validateDepartmentCode,
  validateDepartmentDescription,
  validateDepartmentName,
} from "@/lib/department-validation";

const departmentSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  headId: true,
  createdAt: true,
  updatedAt: true,
  head: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      email: true,
      role: true,
      accountStatus: true,
    },
  },
  _count: {
    select: {
      employees: true,
      reservations: true,
    },
  },
} as const;

function toDepartmentRecord(
  row: Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>,
): DepartmentRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    headId: row.headId,
    head: row.head,
    employeeCount: row._count.employees,
    reservationCount: row._count.reservations,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lists all organizational departments with head and member counts.
 */
export async function listDepartments(): Promise<DepartmentRecord[]> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("department-query", actor.id, 60, 60_000);

  const rows = await prisma.department.findMany({
    select: departmentSelect,
    orderBy: { name: "asc" },
  });

  return rows.map(toDepartmentRecord);
}

/**
 * Retrieves department details, head assignment, and employee membership.
 */
export async function getDepartment(id: string): Promise<DepartmentDetailRecord | null> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("department-query", actor.id, 60, 60_000);

  if (!isValidUuid(id)) return null;

  const row = await prisma.department.findUnique({
    where: { id },
    select: {
      ...departmentSelect,
      employees: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          email: true,
          role: true,
          accountStatus: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!row) return null;

  return {
    ...toDepartmentRecord(row),
    members: row.employees,
  };
}

/**
 * Creates a new organizational department.
 * Enforces unique name and uppercase code.
 */
export async function createDepartment(
  input: CreateDepartmentInput,
): Promise<{ departmentId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("department-mutation", actor.id, 30, 60_000);

  const name = validateDepartmentName(input.name);
  const code = validateDepartmentCode(input.code);
  const description = validateDepartmentDescription(input.description);

  return prisma.$transaction(
    async (tx) => {
      // Re-verify actor under transaction
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });

      if (
        !currentActor ||
        currentActor.role !== UserRole.ADMIN ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      // Check unique constraints case-insensitively
      const existing = await tx.department.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: "insensitive" } },
            { code: { equals: code, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, code: true },
      });

      if (existing) {
        if (existing.name.toLowerCase() === name.toLowerCase()) {
          throw new DepartmentError(
            "A department with this name already exists.",
            "name",
          );
        }
        if (existing.code.toUpperCase() === code.toUpperCase()) {
          throw new DepartmentError(
            "A department with this code already exists.",
            "code",
          );
        }
      }

      const created = await tx.department.create({
        data: {
          name,
          code,
          description,
        },
        select: { id: true },
      });

      return { departmentId: created.id };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Updates department details (name, code, description).
 */
export async function updateDepartment(
  input: UpdateDepartmentInput,
): Promise<{ departmentId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("department-mutation", actor.id, 30, 60_000);

  if (!isValidUuid(input.id)) {
    throw new DepartmentError("Invalid department identifier.");
  }

  const name = validateDepartmentName(input.name);
  const code = validateDepartmentCode(input.code);
  const description = validateDepartmentDescription(input.description);

  return prisma.$transaction(
    async (tx) => {
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });

      if (
        !currentActor ||
        currentActor.role !== UserRole.ADMIN ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      const department = await tx.department.findUnique({
        where: { id: input.id },
        select: { id: true },
      });

      if (!department) {
        throw new DepartmentError("Department not found.", undefined, 404);
      }

      // Check collision with other departments
      const collision = await tx.department.findFirst({
        where: {
          id: { not: input.id },
          OR: [
            { name: { equals: name, mode: "insensitive" } },
            { code: { equals: code, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, code: true },
      });

      if (collision) {
        if (collision.name.toLowerCase() === name.toLowerCase()) {
          throw new DepartmentError(
            "Another department with this name already exists.",
            "name",
          );
        }
        if (collision.code.toUpperCase() === code.toUpperCase()) {
          throw new DepartmentError(
            "Another department with this code already exists.",
            "code",
          );
        }
      }

      await tx.department.update({
        where: { id: input.id },
        data: {
          name,
          code,
          description,
        },
      });

      return { departmentId: input.id };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Designates or replaces a Department Head.
 * Passing `headId = null` clears the designation.
 * Verifies that the designated user is an active DEPARTMENT_HEAD belonging to this department.
 */
export async function designateDepartmentHead(
  departmentId: string,
  headId: string | null,
): Promise<{ departmentId: string; headId: string | null }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("department-mutation", actor.id, 30, 60_000);

  if (!isValidUuid(departmentId)) {
    throw new DepartmentError("Invalid department identifier.");
  }

  if (headId !== null && !isValidUuid(headId)) {
    throw new DepartmentError("Invalid Department Head selection.", "headId");
  }

  return prisma.$transaction(
    async (tx) => {
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });

      if (
        !currentActor ||
        currentActor.role !== UserRole.ADMIN ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      const department = await tx.department.findUnique({
        where: { id: departmentId },
        select: { id: true, headId: true, name: true },
      });

      if (!department) {
        throw new DepartmentError("Department not found.", undefined, 404);
      }

      // If clearing the HOD
      if (headId === null) {
        await tx.department.update({
          where: { id: departmentId },
          data: { headId: null },
        });
        return { departmentId, headId: null };
      }

      // If assigning or replacing HOD
      const candidate = await tx.user.findUnique({
        where: { id: headId },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          departmentId: true,
          name: true,
        },
      });

      if (!candidate) {
        throw new DepartmentError("Selected user account not found.", "headId", 404);
      }

      if (candidate.accountStatus !== AccountStatus.ACTIVE) {
        throw new DepartmentError(
          "Selected user account is inactive. Only active users can be designated as Department Head.",
          "headId",
        );
      }

      if (candidate.role !== UserRole.DEPARTMENT_HEAD) {
        throw new DepartmentError(
          "Only users with the Department Head role may be designated as Department Head.",
          "headId",
        );
      }

      if (candidate.departmentId !== departmentId) {
        throw new DepartmentError(
          "The designated Department Head must belong to this department.",
          "headId",
        );
      }

      // Check if user already heads another department
      const otherHeaded = await tx.department.findFirst({
        where: {
          headId,
          id: { not: departmentId },
        },
        select: { id: true, name: true },
      });

      if (otherHeaded) {
        throw new DepartmentError(
          `This user is already designated as the Head of ${otherHeaded.name}. A user cannot simultaneously head multiple departments.`,
          "headId",
        );
      }

      await tx.department.update({
        where: { id: departmentId },
        data: { headId },
      });

      return { departmentId, headId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Transfers an employee to another department and optionally updates their role.
 * If the user was the designated head of their former department, their head assignment
 * is automatically vacated to prevent stale cross-department assignments.
 * Existing reservation department snapshots are strictly preserved.
 */
export async function transferEmployee(
  input: EmployeeTransferInput,
): Promise<{ userId: string; targetDepartmentId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("employee-transfer", actor.id, 30, 60_000);

  if (!isValidUuid(input.userId)) {
    throw new DepartmentError("Invalid employee identifier.");
  }

  if (!isValidUuid(input.targetDepartmentId)) {
    throw new DepartmentError("Invalid target department.", "targetDepartmentId");
  }

  return prisma.$transaction(
    async (tx) => {
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });

      if (
        !currentActor ||
        currentActor.role !== UserRole.ADMIN ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      // Lock user row
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          role: true,
          departmentId: true,
          employeeId: true,
          accountStatus: true,
        },
      });

      if (!user) {
        throw new DepartmentError("Employee account not found.", undefined, 404);
      }

      const targetDept = await tx.department.findUnique({
        where: { id: input.targetDepartmentId },
        select: { id: true, name: true, headId: true },
      });

      if (!targetDept) {
        throw new DepartmentError(
          "Target department does not exist.",
          "targetDepartmentId",
          404,
        );
      }

      const targetRole = input.newRole ?? user.role;
      if (
        targetRole !== UserRole.EMPLOYEE &&
        targetRole !== UserRole.DEPARTMENT_HEAD &&
        targetRole !== UserRole.ADMIN
      ) {
        throw new DepartmentError("Invalid role assignment.");
      }

      const isTransferringDepartment = user.departmentId !== input.targetDepartmentId;
      const isDemotedFromHod =
        user.role === UserRole.DEPARTMENT_HEAD && targetRole !== UserRole.DEPARTMENT_HEAD;

      // If user is currently designated head of their current department
      if (isTransferringDepartment || isDemotedFromHod) {
        const headedDepts = await tx.department.findMany({
          where: { headId: user.id },
          select: { id: true },
        });

        for (const dept of headedDepts) {
          // If transferring away or demoted, vacate old head assignment
          if (dept.id === user.departmentId || isDemotedFromHod) {
            await tx.department.update({
              where: { id: dept.id },
              data: { headId: null },
            });
          }
        }
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          departmentId: input.targetDepartmentId,
          role: targetRole,
          sessionVersion: { increment: 1 },
        },
      });

      return { userId: user.id, targetDepartmentId: input.targetDepartmentId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Promotes an active employee belonging to a department to DEPARTMENT_HEAD
 * and designates them as the head of that department in a single atomic transaction.
 */
export async function promoteAndDesignateHead(
  departmentId: string,
  userId: string,
): Promise<{ departmentId: string; headId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("department-mutation", actor.id, 30, 60_000);

  if (!isValidUuid(departmentId) || !isValidUuid(userId)) {
    throw new DepartmentError("Invalid department or employee identifier.");
  }

  return prisma.$transaction(
    async (tx) => {
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });

      if (
        !currentActor ||
        currentActor.role !== UserRole.ADMIN ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      const department = await tx.department.findUnique({
        where: { id: departmentId },
        select: { id: true, headId: true, name: true },
      });

      if (!department) {
        throw new DepartmentError("Department not found.", undefined, 404);
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          role: true,
          accountStatus: true,
          departmentId: true,
        },
      });

      if (!user) {
        throw new DepartmentError("Employee not found.", undefined, 404);
      }

      if (user.accountStatus !== AccountStatus.ACTIVE) {
        throw new DepartmentError(
          "Employee account is inactive. Only active accounts can be promoted and designated.",
        );
      }

      if (user.departmentId !== departmentId) {
        throw new DepartmentError(
          "The employee must belong to this department to be designated as Department Head.",
        );
      }

      // Check if user already heads another department
      const otherHeaded = await tx.department.findFirst({
        where: {
          headId: userId,
          id: { not: departmentId },
        },
        select: { id: true, name: true },
      });

      if (otherHeaded) {
        throw new DepartmentError(
          `This user is already designated as the Head of ${otherHeaded.name}.`,
        );
      }

      // Promote role if not already DEPARTMENT_HEAD
      if (user.role !== UserRole.DEPARTMENT_HEAD) {
        await tx.user.update({
          where: { id: userId },
          data: {
            role: UserRole.DEPARTMENT_HEAD,
            sessionVersion: { increment: 1 },
          },
        });
      }

      // Update headId
      await tx.department.update({
        where: { id: departmentId },
        data: { headId: userId },
      });

      return { departmentId, headId: userId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}
