import "server-only";

import {
  AccountStatus,
  ApprovalDecision,
  ApprovalStage,
  ReservationStatus,
  UserRole,
  type Prisma,
} from "@/generated/prisma/client";
import {
  AuthorizationError,
  requireAuthenticatedUser,
  requireRole,
} from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import type {
  AdminReservationQueueTab,
  AvailableVehicleSummary,
  DirectBookingInput,
  ReservationListResult,
  ReservationRecord,
  ReservationTabFilter,
  VehicleRequestInput,
} from "@/lib/reservation-types";
import {
  ReservationError,
  getDisplayReservationStatus,
  isValidUuid,
  parseDirectBookingInput,
  parseVehicleRequestInput,
} from "@/lib/reservation-validation";

const categorySelect = {
  id: true,
  name: true,
  code: true,
  isVehicle: true,
} as const;

const resourceSelect = {
  id: true,
  name: true,
  resourceCode: true,
  location: true,
  capacity: true,
  imageUrl: true,
  requiresApproval: true,
  isActive: true,
  category: {
    select: categorySelect,
  },
} as const;

const approvalInclude = {
  approver: {
    select: {
      id: true,
      name: true,
      email: true,
      employeeId: true,
    },
  },
} as const;

const reservationInclude = {
  requester: {
    select: {
      id: true,
      name: true,
      email: true,
      employeeId: true,
    },
  },
  department: {
    select: {
      id: true,
      name: true,
      code: true,
      headId: true,
    },
  },
  requestedCategory: {
    select: categorySelect,
  },
  resource: {
    select: resourceSelect,
  },
  driver: {
    select: {
      id: true,
      name: true,
      driverIdentifier: true,
    },
  },
  approvals: {
    include: approvalInclude,
    orderBy: {
      decidedAt: "asc",
    },
  },
} as const;

function isExclusionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const str = String(error);
  const msg = "message" in error && typeof error.message === "string" ? error.message : "";
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return (
    code === "23P01" ||
    msg.includes("23P01") ||
    msg.includes("Reservation_confirmed_resource_no_overlap") ||
    msg.includes("Reservation_confirmed_driver_no_overlap") ||
    str.includes("23P01") ||
    str.includes("Reservation_confirmed_resource_no_overlap") ||
    str.includes("Reservation_confirmed_driver_no_overlap")
  );
}

function isDriverExclusionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const str = String(error);
  const msg = "message" in error && typeof error.message === "string" ? error.message : "";
  return (
    msg.includes("Reservation_confirmed_driver_no_overlap") ||
    str.includes("Reservation_confirmed_driver_no_overlap")
  );
}

function toReservationRecord(
  row: Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>,
  now: Date = new Date(),
): ReservationRecord {
  return {
    id: row.id,
    requesterId: row.requesterId,
    departmentId: row.departmentId,
    requestedCategoryId: row.requestedCategoryId,
    resourceId: row.resourceId,
    driverId: row.driverId,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    purpose: row.purpose,
    destination: row.destination,
    passengerCount: row.passengerCount ?? null,
    status: row.status,
    displayStatus: getDisplayReservationStatus(row.status, row.endTime, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requester: row.requester,
    department: row.department,
    requestedCategory: row.requestedCategory,
    resource: row.resource,
    driver: row.driver
      ? {
          id: row.driver.id,
          name: row.driver.name,
          driverIdentifier: row.driver.driverIdentifier,
        }
      : null,
    approvals: (row.approvals ?? []).map((a) => ({
      id: a.id,
      reservationId: a.reservationId,
      approverId: a.approverId,
      stage: a.stage,
      decision: a.decision,
      rejectionReason: a.rejectionReason,
      decidedAt: a.decidedAt.toISOString(),
      approver: a.approver,
    })),
  };
}

/**
 * Returns resource details if it exists and can be inspected for booking or request.
 */
export async function getEligibleDirectResource(id: string) {
  await requireAuthenticatedUser();
  if (!isValidUuid(id)) return null;

  return prisma.resource.findUnique({
    where: { id },
    select: resourceSelect,
  });
}

export const getResourceForBooking = getEligibleDirectResource;

/**
 * Pre-checks resource availability for the specified interval.
 */
export async function checkResourceAvailability(
  resourceId: string,
  startTime: Date,
  endTime: Date,
  excludeReservationId?: string,
): Promise<{ available: boolean; conflict?: { startTime: string; endTime: string } }> {
  await requireAuthenticatedUser();
  if (!isValidUuid(resourceId)) {
    throw new ReservationError("Invalid resource selection.", "resourceId");
  }

  const conflict = await prisma.reservation.findFirst({
    where: {
      resourceId,
      status: ReservationStatus.CONFIRMED,
      ...(excludeReservationId && isValidUuid(excludeReservationId)
        ? { id: { not: excludeReservationId } }
        : {}),
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
    },
  });

  if (conflict) {
    return {
      available: false,
      conflict: {
        startTime: conflict.startTime.toISOString(),
        endTime: conflict.endTime.toISOString(),
      },
    };
  }

  return { available: true };
}

/**
 * Creates a direct confirmed reservation inside a transaction with
 * resource row-locking and PostgreSQL GiST exclusion conflict handling.
 */
export async function createDirectReservation(input: DirectBookingInput) {
  const actor = await requireAuthenticatedUser();
  await enforceRateLimit("direct-booking", actor.id, 30, 60_000);

  const parsed = parseDirectBookingInput(input);

  try {
    const reservationId = await prisma.$transaction(
      async (tx) => {
        // Re-check actor state in transaction
        const currentActor = await tx.user.findUnique({
          where: { id: actor.id },
          select: {
            id: true,
            accountStatus: true,
            mustChangePassword: true,
            sessionVersion: true,
            departmentId: true,
          },
        });

        if (
          !currentActor ||
          currentActor.accountStatus !== AccountStatus.ACTIVE ||
          currentActor.mustChangePassword ||
          currentActor.sessionVersion !== actor.sessionVersion
        ) {
          throw new AuthorizationError("FORBIDDEN", 403);
        }

        // Lock resource row for update
        const resources = await tx.$queryRaw<
          {
            id: string;
            categoryId: string;
            isActive: boolean;
            requiresApproval: boolean;
            isVehicle: boolean;
          }[]
        >`
          SELECT r."id", r."categoryId", r."isActive", r."requiresApproval", c."isVehicle"
          FROM "public"."Resource" r
          JOIN "public"."ResourceCategory" c ON r."categoryId" = c."id"
          WHERE r."id" = ${parsed.resourceId}::uuid
          FOR UPDATE;
        `;

        if (!resources || resources.length === 0) {
          throw new ReservationError("The requested resource was not found.", "resourceId");
        }

        const resource = resources[0];

        if (!resource.isActive) {
          throw new ReservationError(
            "This resource is inactive and cannot be reserved.",
            "resourceId",
          );
        }

        if (resource.isVehicle) {
          throw new ReservationError(
            "Vehicles cannot be booked directly. Transport requests require vehicle allocation.",
            "resourceId",
          );
        }

        if (resource.requiresApproval) {
          throw new ReservationError(
            "This resource requires managerial approval and cannot be booked directly.",
            "resourceId",
          );
        }

        // Application-level conflict check
        const conflict = await tx.reservation.findFirst({
          where: {
            resourceId: resource.id,
            status: ReservationStatus.CONFIRMED,
            startTime: { lt: parsed.end },
            endTime: { gt: parsed.start },
          },
          select: { id: true, startTime: true, endTime: true },
        });

        if (conflict) {
          throw new ReservationError(
            "This room is already booked for the selected time. Choose another time slot.",
          );
        }

        // Create confirmed reservation with department snapshot
        const created = await tx.reservation.create({
          data: {
            requesterId: currentActor.id,
            departmentId: currentActor.departmentId,
            requestedCategoryId: resource.categoryId,
            resourceId: resource.id,
            startTime: parsed.start,
            endTime: parsed.end,
            purpose: parsed.purpose,
            status: ReservationStatus.CONFIRMED,
          },
          select: { id: true },
        });

        return created.id;
      },
      { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
    );

    return { reservationId };
  } catch (error) {
    if (isExclusionConflict(error)) {
      throw new ReservationError(
        "This room is already booked for the selected time. Choose another time slot.",
      );
    }
    throw error;
  }
}

/**
 * Submits a reservation request for an approval-required standard resource.
 * Persists with PENDING status. Does NOT allocate availability or confirm immediately.
 */
export async function createReservationRequest(input: DirectBookingInput) {
  const actor = await requireAuthenticatedUser();
  await enforceRateLimit("reservation-request", actor.id, 30, 60_000);

  const parsed = parseDirectBookingInput(input);

  const reservationId = await prisma.$transaction(
    async (tx) => {
      // Re-verify actor
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
          departmentId: true,
        },
      });

      if (
        !currentActor ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      // Lock resource row for update
      const resources = await tx.$queryRaw<
        {
          id: string;
          categoryId: string;
          isActive: boolean;
          requiresApproval: boolean;
          isVehicle: boolean;
        }[]
      >`
        SELECT r."id", r."categoryId", r."isActive", r."requiresApproval", c."isVehicle"
        FROM "public"."Resource" r
        JOIN "public"."ResourceCategory" c ON r."categoryId" = c."id"
        WHERE r."id" = ${parsed.resourceId}::uuid
        FOR UPDATE;
      `;

      if (!resources || resources.length === 0) {
        throw new ReservationError("The requested resource was not found.", "resourceId");
      }

      const resource = resources[0];

      if (!resource.isActive) {
        throw new ReservationError(
          "This resource is inactive and cannot accept reservation requests.",
          "resourceId",
        );
      }

      if (resource.isVehicle) {
        throw new ReservationError(
          "Vehicles cannot be requested through this workflow. Transport requests follow vehicle allocation.",
          "resourceId",
        );
      }

      if (!resource.requiresApproval) {
        throw new ReservationError(
          "This resource does not require approval. Please book it directly.",
          "resourceId",
        );
      }

      // Persist pending reservation without consuming availability
      const created = await tx.reservation.create({
        data: {
          requesterId: currentActor.id,
          departmentId: currentActor.departmentId,
          requestedCategoryId: resource.categoryId,
          resourceId: resource.id,
          startTime: parsed.start,
          endTime: parsed.end,
          purpose: parsed.purpose,
          status: ReservationStatus.PENDING,
        },
        select: { id: true },
      });

      return created.id;
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );

  return { reservationId };
}

/**
 * Submits a vehicle category transport reservation request.
 * Persists with PENDING status, resourceId=NULL, driverId=NULL.
 * Does NOT allocate availability or reserve vehicles/drivers.
 * Multiple pending requests may overlap.
 */
export async function createVehicleReservationRequest(input: VehicleRequestInput) {
  const actor = await requireAuthenticatedUser();
  await enforceRateLimit("vehicle-request", actor.id, 30, 60_000);

  const parsed = parseVehicleRequestInput(input);

  const reservationId = await prisma.$transaction(
    async (tx) => {
      // Re-verify current actor state and department snapshot
      const currentActor = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          id: true,
          accountStatus: true,
          mustChangePassword: true,
          sessionVersion: true,
          departmentId: true,
        },
      });

      if (
        !currentActor ||
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      // Verify category exists and is a vehicle category
      const category = await tx.resourceCategory.findUnique({
        where: { id: parsed.categoryId },
        select: {
          id: true,
          name: true,
          isVehicle: true,
        },
      });

      if (!category) {
        throw new ReservationError(
          "The selected category does not exist.",
          "requestedCategoryId",
        );
      }

      if (!category.isVehicle) {
        throw new ReservationError(
          "The selected category is not a vehicle or transport category.",
          "requestedCategoryId",
        );
      }

      // Persist vehicle reservation request
      // resourceId and driverId are explicitly NULL at submission.
      // Availability is not reserved at this stage.
      const created = await tx.reservation.create({
        data: {
          requesterId: currentActor.id,
          departmentId: currentActor.departmentId,
          requestedCategoryId: category.id,
          resourceId: null,
          driverId: null,
          startTime: parsed.start,
          endTime: parsed.end,
          destination: parsed.destination,
          purpose: parsed.purpose,
          passengerCount: parsed.passengerCount,
          status: ReservationStatus.PENDING,
        },
        select: { id: true },
      });

      return created.id;
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );

  return { reservationId };
}

/**
 * Admin forwards PENDING request to Department Head: PENDING -> AWAITING_APPROVAL.
 * Validates that the requesting department has an active Department Head.
 */
export async function adminForwardToHod(reservationId: string) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("approval-action", actor.id, 60, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
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

      const reservations = await tx.$queryRaw<
        {
          id: string;
          status: ReservationStatus;
          departmentId: string;
        }[]
      >`
        SELECT "id", "status", "departmentId"
        FROM "public"."Reservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE;
      `;

      if (!reservations || reservations.length === 0) {
        throw new ReservationError("Reservation not found.", undefined, 404);
      }

      const reservation = reservations[0];

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new ReservationError(
          "Only pending requests can be forwarded for Department Head approval.",
        );
      }

      // Validate requesting department has an eligible Department Head
      const department = await tx.department.findUnique({
        where: { id: reservation.departmentId },
        select: {
          id: true,
          name: true,
          headId: true,
          head: {
            select: {
              id: true,
              accountStatus: true,
              mustChangePassword: true,
            },
          },
        },
      });

      if (
        !department?.headId ||
        !department.head ||
        department.head.accountStatus !== AccountStatus.ACTIVE ||
        department.head.mustChangePassword
      ) {
        throw new ReservationError(
          "The requesting department does not have an active Department Head assigned. Please assign an active Department Head before forwarding.",
        );
      }

      const existing = await tx.approval.findUnique({
        where: {
          reservationId_stage: {
            reservationId,
            stage: ApprovalStage.ADMIN_REVIEW,
          },
        },
      });

      if (existing) {
        throw new ReservationError(
          "An administrative review decision has already been recorded for this request.",
        );
      }

      await tx.approval.create({
        data: {
          reservationId,
          approverId: currentActor.id,
          stage: ApprovalStage.ADMIN_REVIEW,
          decision: ApprovalDecision.APPROVED,
        },
      });

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.AWAITING_APPROVAL },
      });

      return { id: reservationId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Admin rejects PENDING request: PENDING -> REJECTED.
 * Requires a meaningful rejection reason.
 */
export async function adminRejectRequest(
  reservationId: string,
  rejectionReason: string,
) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("approval-action", actor.id, 60, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
  }

  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (!reason) {
    throw new ReservationError("A rejection reason is required.", "rejectionReason");
  }
  if (reason.length > 1000) {
    throw new ReservationError(
      "Rejection reason must not exceed 1000 characters.",
      "rejectionReason",
    );
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

      const reservations = await tx.$queryRaw<
        {
          id: string;
          status: ReservationStatus;
        }[]
      >`
        SELECT "id", "status"
        FROM "public"."Reservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE;
      `;

      if (!reservations || reservations.length === 0) {
        throw new ReservationError("Reservation not found.", undefined, 404);
      }

      const reservation = reservations[0];

      if (reservation.status !== ReservationStatus.PENDING) {
        throw new ReservationError(
          "Only pending requests can be rejected during administrative review.",
        );
      }

      const existing = await tx.approval.findUnique({
        where: {
          reservationId_stage: {
            reservationId,
            stage: ApprovalStage.ADMIN_REVIEW,
          },
        },
      });

      if (existing) {
        throw new ReservationError(
          "An administrative review decision has already been recorded for this request.",
        );
      }

      await tx.approval.create({
        data: {
          reservationId,
          approverId: currentActor.id,
          stage: ApprovalStage.ADMIN_REVIEW,
          decision: ApprovalDecision.REJECTED,
          rejectionReason: reason,
        },
      });

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.REJECTED },
      });

      return { id: reservationId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Department Head approves request: AWAITING_APPROVAL -> APPROVED.
 * Enforces HOD department leadership and prevents self-approval.
 */
export async function hodApproveRequest(reservationId: string) {
  const actor = await requireAuthenticatedUser();
  await enforceRateLimit("approval-action", actor.id, 60, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
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
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      const reservations = await tx.$queryRaw<
        {
          id: string;
          requesterId: string;
          status: ReservationStatus;
          departmentId: string;
        }[]
      >`
        SELECT "id", "requesterId", "status", "departmentId"
        FROM "public"."Reservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE;
      `;

      if (!reservations || reservations.length === 0) {
        throw new ReservationError("Reservation not found.", undefined, 404);
      }

      const reservation = reservations[0];

      if (reservation.status !== ReservationStatus.AWAITING_APPROVAL) {
        throw new ReservationError(
          "This request is not currently awaiting Department Head approval.",
        );
      }

      // Verify that actor leads the reservation's department
      const department = await tx.department.findUnique({
        where: { id: reservation.departmentId },
        select: { id: true, headId: true },
      });

      if (!department || department.headId !== currentActor.id) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      // Self-approval prevention
      if (reservation.requesterId === currentActor.id) {
        throw new ReservationError(
          "Department Heads cannot approve their own reservation requests. Please contact an Administrator.",
        );
      }

      // Verify prerequisite ADMIN_REVIEW was APPROVED
      const adminApproval = await tx.approval.findUnique({
        where: {
          reservationId_stage: {
            reservationId,
            stage: ApprovalStage.ADMIN_REVIEW,
          },
        },
      });

      if (!adminApproval || adminApproval.decision !== ApprovalDecision.APPROVED) {
        throw new ReservationError(
          "This request has not received valid administrative review approval.",
        );
      }

      const existing = await tx.approval.findUnique({
        where: {
          reservationId_stage: {
            reservationId,
            stage: ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
          },
        },
      });

      if (existing) {
        throw new ReservationError(
          "A Department Head decision has already been recorded for this request.",
        );
      }

      await tx.approval.create({
        data: {
          reservationId,
          approverId: currentActor.id,
          stage: ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
          decision: ApprovalDecision.APPROVED,
        },
      });

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.APPROVED },
      });

      return { id: reservationId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Department Head rejects request: AWAITING_APPROVAL -> REJECTED.
 * Enforces HOD department leadership, prevents self-decision, and requires rejection reason.
 */
export async function hodRejectRequest(
  reservationId: string,
  rejectionReason: string,
) {
  const actor = await requireAuthenticatedUser();
  await enforceRateLimit("approval-action", actor.id, 60, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
  }

  const reason = typeof rejectionReason === "string" ? rejectionReason.trim() : "";
  if (!reason) {
    throw new ReservationError("A rejection reason is required.", "rejectionReason");
  }
  if (reason.length > 1000) {
    throw new ReservationError(
      "Rejection reason must not exceed 1000 characters.",
      "rejectionReason",
    );
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
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      const reservations = await tx.$queryRaw<
        {
          id: string;
          requesterId: string;
          status: ReservationStatus;
          departmentId: string;
        }[]
      >`
        SELECT "id", "requesterId", "status", "departmentId"
        FROM "public"."Reservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE;
      `;

      if (!reservations || reservations.length === 0) {
        throw new ReservationError("Reservation not found.", undefined, 404);
      }

      const reservation = reservations[0];

      if (reservation.status !== ReservationStatus.AWAITING_APPROVAL) {
        throw new ReservationError(
          "This request is not currently awaiting Department Head approval.",
        );
      }

      const department = await tx.department.findUnique({
        where: { id: reservation.departmentId },
        select: { id: true, headId: true },
      });

      if (!department || department.headId !== currentActor.id) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      if (reservation.requesterId === currentActor.id) {
        throw new ReservationError(
          "Department Heads cannot decide their own reservation requests. Please contact an Administrator.",
        );
      }

      const existing = await tx.approval.findUnique({
        where: {
          reservationId_stage: {
            reservationId,
            stage: ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
          },
        },
      });

      if (existing) {
        throw new ReservationError(
          "A Department Head decision has already been recorded for this request.",
        );
      }

      await tx.approval.create({
        data: {
          reservationId,
          approverId: currentActor.id,
          stage: ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
          decision: ApprovalDecision.REJECTED,
          rejectionReason: reason,
        },
      });

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.REJECTED },
      });

      return { id: reservationId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Admin final confirmation: APPROVED -> CONFIRMED.
 * Revalidates resource status, checks previous approvals, and rechecks current availability.
 * If slot has become unavailable, keeps reservation APPROVED and throws conflict message.
 */
export async function adminFinalConfirm(reservationId: string) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("approval-action", actor.id, 60, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
  }

  try {
    return await prisma.$transaction(
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

        const reservations = await tx.$queryRaw<
          {
            id: string;
            status: ReservationStatus;
            resourceId: string | null;
            startTime: Date;
            endTime: Date;
          }[]
        >`
          SELECT "id", "status", "resourceId", "startTime", "endTime"
          FROM "public"."Reservation"
          WHERE "id" = ${reservationId}::uuid
          FOR UPDATE;
        `;

        if (!reservations || reservations.length === 0) {
          throw new ReservationError("Reservation not found.", undefined, 404);
        }

        const reservation = reservations[0];

        if (reservation.status !== ReservationStatus.APPROVED) {
          throw new ReservationError(
            "Only approved reservation requests can receive final confirmation.",
          );
        }

        if (!reservation.resourceId) {
          throw new ReservationError(
            "Vehicle requests require vehicle and driver allocation before final confirmation.",
          );
        }

        // Revalidate resource
        const resources = await tx.$queryRaw<
          {
            id: string;
            isActive: boolean;
            requiresApproval: boolean;
            isVehicle: boolean;
          }[]
        >`
          SELECT r."id", r."isActive", r."requiresApproval", c."isVehicle"
          FROM "public"."Resource" r
          JOIN "public"."ResourceCategory" c ON r."categoryId" = c."id"
          WHERE r."id" = ${reservation.resourceId}::uuid
          FOR UPDATE;
        `;

        if (!resources || resources.length === 0 || !resources[0].isActive) {
          throw new ReservationError(
            "The requested resource is inactive and cannot be confirmed.",
          );
        }

        if (resources[0].isVehicle) {
          throw new ReservationError(
            "Vehicles cannot be confirmed through this workflow.",
          );
        }

        // Validate both prerequisite approval stages
        const approvals = await tx.approval.findMany({
          where: {
            reservationId,
            stage: {
              in: [
                ApprovalStage.ADMIN_REVIEW,
                ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
              ],
            },
          },
        });

        const adminReview = approvals.find(
          (a) => a.stage === ApprovalStage.ADMIN_REVIEW,
        );
        const hodApproval = approvals.find(
          (a) => a.stage === ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
        );

        if (
          !adminReview ||
          adminReview.decision !== ApprovalDecision.APPROVED ||
          !hodApproval ||
          hodApproval.decision !== ApprovalDecision.APPROVED
        ) {
          throw new ReservationError(
            "This request has not completed all required prerequisite approval decisions.",
          );
        }

        // Check current slot availability against confirmed reservations
        const conflict = await tx.reservation.findFirst({
          where: {
            resourceId: reservation.resourceId,
            status: ReservationStatus.CONFIRMED,
            id: { not: reservationId },
            startTime: { lt: reservation.endTime },
            endTime: { gt: reservation.startTime },
          },
          select: { id: true },
        });

        if (conflict) {
          throw new ReservationError(
            "This resource is already reserved during the requested time interval. The reservation remains approved pending scheduling resolution.",
          );
        }

        const existing = await tx.approval.findUnique({
          where: {
            reservationId_stage: {
              reservationId,
              stage: ApprovalStage.ADMIN_CONFIRMATION,
            },
          },
        });

        if (existing) {
          throw new ReservationError(
            "A final confirmation decision has already been recorded for this request.",
          );
        }

        await tx.approval.create({
          data: {
            reservationId,
            approverId: currentActor.id,
            stage: ApprovalStage.ADMIN_CONFIRMATION,
            decision: ApprovalDecision.APPROVED,
          },
        });

        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: ReservationStatus.CONFIRMED },
        });

        return { id: reservationId };
      },
      { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    if (isExclusionConflict(error)) {
      throw new ReservationError(
        "This resource is already reserved during the requested time interval. The reservation remains approved pending scheduling resolution.",
      );
    }
    throw error;
  }
}

/**
 * Lists available active vehicles in a given vehicle category that satisfy passenger count
 * and have no overlapping CONFIRMED reservation during [startTime, endTime).
 */
export async function listAvailableVehicles(
  categoryId: string,
  startTime: Date,
  endTime: Date,
  passengerCount?: number | null,
): Promise<AvailableVehicleSummary[]> {
  await requireAuthenticatedUser();

  if (!isValidUuid(categoryId)) {
    throw new ReservationError("Invalid vehicle category identifier.");
  }

  const startMs = typeof startTime?.getTime === "function" ? startTime.getTime() : NaN;
  const endMs = typeof endTime?.getTime === "function" ? endTime.getTime() : NaN;

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new ReservationError("Invalid booking interval timestamps.");
  }
  if (endMs <= startMs) {
    throw new ReservationError("End time must be after start time.");
  }

  const vehicles = await prisma.resource.findMany({
    where: {
      categoryId,
      isActive: true,
      category: { isVehicle: true },
      ...(passengerCount != null && passengerCount > 0
        ? {
            OR: [
              { capacity: null },
              { capacity: { gte: passengerCount } },
            ],
          }
        : {}),
      reservations: {
        none: {
          status: ReservationStatus.CONFIRMED,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
    },
    select: {
      id: true,
      name: true,
      resourceCode: true,
      capacity: true,
      imageUrl: true,
    },
    orderBy: [{ name: "asc" }, { resourceCode: "asc" }],
  });

  return vehicles;
}

/**
 * Atomically allocates an eligible vehicle and driver to an APPROVED vehicle reservation,
 * transitions status to CONFIRMED, and records ADMIN_CONFIRMATION audit entry.
 *
 * Enforces:
 * - Active Admin role.
 * - Row locks on Reservation, Resource, and Driver in deterministic order.
 * - Prerequisite ADMIN_REVIEW and DEPARTMENT_HEAD_APPROVAL approvals exist.
 * - No existing ADMIN_CONFIRMATION approval.
 * - Vehicle category matches requestedCategoryId and isVehicle=true.
 * - Vehicle is active and capacity >= passengerCount.
 * - Driver is active.
 * - Neither vehicle nor driver has overlapping CONFIRMED reservations.
 * - Catches SQLSTATE 23P01 exclusion constraints and translates into clear user errors.
 * - Atomic rollback on any failure.
 */
export async function adminAllocateVehicleAndConfirm(
  reservationId: string,
  vehicleId: string,
  driverId: string,
) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("approval-action", actor.id, 60, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
  }
  if (!isValidUuid(vehicleId)) {
    throw new ReservationError("A valid vehicle selection is required.", "resourceId");
  }
  if (!isValidUuid(driverId)) {
    throw new ReservationError("A valid driver selection is required.", "driverId");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Verify authenticated actor eligibility inside transaction
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

        // 2. Lock reservation row FOR UPDATE
        const reservations = await tx.$queryRaw<
          {
            id: string;
            status: ReservationStatus;
            requestedCategoryId: string;
            resourceId: string | null;
            driverId: string | null;
            startTime: Date;
            endTime: Date;
            passengerCount: number | null;
            isVehicle: boolean;
          }[]
        >`
          SELECT r."id", r."status", r."requestedCategoryId", r."resourceId", r."driverId",
                 r."startTime", r."endTime", r."passengerCount", c."isVehicle"
          FROM "public"."Reservation" r
          JOIN "public"."ResourceCategory" c ON r."requestedCategoryId" = c."id"
          WHERE r."id" = ${reservationId}::uuid
          FOR UPDATE;
        `;

        if (!reservations || reservations.length === 0) {
          throw new ReservationError("Reservation not found.", undefined, 404);
        }

        const reservation = reservations[0];

        // 3. Verify status is APPROVED
        if (reservation.status !== ReservationStatus.APPROVED) {
          throw new ReservationError(
            "Only approved reservation requests can receive vehicle and driver allocation.",
          );
        }

        // 4. Verify the category is a vehicle category
        if (!reservation.isVehicle) {
          throw new ReservationError(
            "This reservation is not a vehicle request and cannot receive vehicle allocation.",
          );
        }

        // 5. Verify required prerequisite approvals exist
        const approvals = await tx.approval.findMany({
          where: {
            reservationId,
            stage: {
              in: [
                ApprovalStage.ADMIN_REVIEW,
                ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
              ],
            },
          },
        });

        const adminReview = approvals.find(
          (a) => a.stage === ApprovalStage.ADMIN_REVIEW,
        );
        const hodApproval = approvals.find(
          (a) => a.stage === ApprovalStage.DEPARTMENT_HEAD_APPROVAL,
        );

        if (
          !adminReview ||
          adminReview.decision !== ApprovalDecision.APPROVED ||
          !hodApproval ||
          hodApproval.decision !== ApprovalDecision.APPROVED
        ) {
          throw new ReservationError(
            "This request has not completed all required prerequisite approval decisions.",
          );
        }

        // 6. Verify there is no existing ADMIN_CONFIRMATION decision
        const existingConfirmation = await tx.approval.findUnique({
          where: {
            reservationId_stage: {
              reservationId,
              stage: ApprovalStage.ADMIN_CONFIRMATION,
            },
          },
        });

        if (existingConfirmation) {
          throw new ReservationError(
            "A final confirmation decision has already been recorded for this request.",
          );
        }

        // 7. Lock selected vehicle and driver rows in deterministic order
        const vehicles = await tx.$queryRaw<
          {
            id: string;
            categoryId: string;
            capacity: number | null;
            isActive: boolean;
            name: string;
            resourceCode: string;
            isVehicle: boolean;
          }[]
        >`
          SELECT r."id", r."categoryId", r."capacity", r."isActive", r."name", r."resourceCode", c."isVehicle"
          FROM "public"."Resource" r
          JOIN "public"."ResourceCategory" c ON r."categoryId" = c."id"
          WHERE r."id" = ${vehicleId}::uuid
          FOR UPDATE;
        `;

        if (!vehicles || vehicles.length === 0) {
          throw new ReservationError("Vehicle not found.", "resourceId", 404);
        }

        const vehicle = vehicles[0];

        const drivers = await tx.$queryRaw<
          {
            id: string;
            name: string;
            driverIdentifier: string;
            isActive: boolean;
          }[]
        >`
          SELECT d."id", d."name", d."driverIdentifier", d."isActive"
          FROM "public"."Driver" d
          WHERE d."id" = ${driverId}::uuid
          FOR UPDATE;
        `;

        if (!drivers || drivers.length === 0) {
          throw new ReservationError("Driver not found.", "driverId", 404);
        }

        const driver = drivers[0];

        // 8. Verify vehicle active, category match, and capacity
        if (!vehicle.isActive) {
          throw new ReservationError(
            "The selected vehicle is inactive and cannot be allocated.",
            "resourceId",
          );
        }

        if (vehicle.categoryId !== reservation.requestedCategoryId || !vehicle.isVehicle) {
          throw new ReservationError(
            "The selected vehicle does not belong to the requested vehicle category.",
            "resourceId",
          );
        }

        if (
          reservation.passengerCount !== null &&
          vehicle.capacity !== null &&
          vehicle.capacity < reservation.passengerCount
        ) {
          throw new ReservationError(
            `The selected vehicle capacity (${vehicle.capacity}) is insufficient for ${reservation.passengerCount} passengers.`,
            "resourceId",
          );
        }

        // 9. Verify driver active status
        if (!driver.isActive) {
          throw new ReservationError(
            "The selected driver is inactive and cannot be allocated.",
            "driverId",
          );
        }

        // 10. Recheck resource and driver availability against CONFIRMED reservations
        const vehicleConflict = await tx.reservation.findFirst({
          where: {
            resourceId: vehicleId,
            status: ReservationStatus.CONFIRMED,
            id: { not: reservationId },
            startTime: { lt: reservation.endTime },
            endTime: { gt: reservation.startTime },
          },
          select: { id: true },
        });

        if (vehicleConflict) {
          throw new ReservationError(
            "The selected vehicle is already reserved during the requested time interval.",
            "resourceId",
          );
        }

        const driverConflict = await tx.reservation.findFirst({
          where: {
            driverId: driverId,
            status: ReservationStatus.CONFIRMED,
            id: { not: reservationId },
            startTime: { lt: reservation.endTime },
            endTime: { gt: reservation.startTime },
          },
          select: { id: true },
        });

        if (driverConflict) {
          throw new ReservationError(
            "The selected driver is already assigned to a confirmed reservation during the requested time interval.",
            "driverId",
          );
        }

        // 11 & 12. Assign resourceId, driverId, and transition status to CONFIRMED
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            resourceId: vehicleId,
            driverId: driverId,
            status: ReservationStatus.CONFIRMED,
          },
        });

        // 13. Record ADMIN_CONFIRMATION audit decision
        await tx.approval.create({
          data: {
            reservationId,
            approverId: currentActor.id,
            stage: ApprovalStage.ADMIN_CONFIRMATION,
            decision: ApprovalDecision.APPROVED,
          },
        });

        return {
          reservationId,
          resourceId: vehicleId,
          driverId,
          status: ReservationStatus.CONFIRMED,
        };
      },
      { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    if (error instanceof ReservationError || error instanceof AuthorizationError) {
      throw error;
    }

    if (isDriverExclusionConflict(error)) {
      throw new ReservationError(
        "The selected driver is already assigned to a confirmed reservation during the requested time interval.",
        "driverId",
      );
    }

    if (isExclusionConflict(error)) {
      throw new ReservationError(
        "The selected vehicle is already reserved during the requested time interval.",
        "resourceId",
      );
    }

    throw error;
  }
}

/**
 * Cancels a reservation.
 * Permitted for the original requester or an Administrator.
 * Allowed during PENDING, AWAITING_APPROVAL, APPROVED, or unelapsed CONFIRMED stages.
 */
export async function cancelReservation(reservationId: string) {
  const actor = await requireAuthenticatedUser();
  await enforceRateLimit("cancel-reservation", actor.id, 30, 60_000);

  if (!isValidUuid(reservationId)) {
    throw new ReservationError("Invalid reservation identifier.");
  }

  return prisma.$transaction(
    async (tx) => {
      // Re-verify actor state
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
        currentActor.accountStatus !== AccountStatus.ACTIVE ||
        currentActor.mustChangePassword ||
        currentActor.sessionVersion !== actor.sessionVersion
      ) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      // Lock reservation row
      const reservations = await tx.$queryRaw<
        {
          id: string;
          requesterId: string;
          status: ReservationStatus;
          startTime: Date;
          endTime: Date;
        }[]
      >`
        SELECT "id", "requesterId", "status", "startTime", "endTime"
        FROM "public"."Reservation"
        WHERE "id" = ${reservationId}::uuid
        FOR UPDATE;
      `;

      if (!reservations || reservations.length === 0) {
        throw new ReservationError("Reservation not found.", undefined, 404);
      }

      const reservation = reservations[0];

      // Authorization: Requester or Admin
      const isOwner = currentActor.id === reservation.requesterId;
      const isAdmin = currentActor.role === UserRole.ADMIN;
      if (!isOwner && !isAdmin) {
        throw new AuthorizationError("FORBIDDEN", 403);
      }

      if (reservation.status === ReservationStatus.CANCELLED) {
        throw new ReservationError("This reservation has already been cancelled.");
      }

      if (reservation.status === ReservationStatus.REJECTED) {
        throw new ReservationError("Rejected reservations cannot be cancelled.");
      }

      const now = new Date();
      if (
        reservation.status === ReservationStatus.CONFIRMED &&
        new Date(reservation.endTime).getTime() <= now.getTime()
      ) {
        throw new ReservationError("Completed reservations cannot be cancelled.");
      }

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.CANCELLED },
      });

      return { id: reservationId };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Retrieves a reservation with access control:
 * - Admin can view any reservation
 * - Department Head can view reservations of their department
 * - Employees can view their own reservations
 */
export async function getReservation(id: string): Promise<ReservationRecord | null> {
  const actor = await requireAuthenticatedUser();
  if (!isValidUuid(id)) return null;

  const row = await prisma.reservation.findUnique({
    where: { id },
    include: reservationInclude,
  });

  if (!row) return null;

  const isOwner = actor.id === row.requesterId;
  const isAdmin = actor.role === UserRole.ADMIN;
  let isDepartmentHead = false;

  if (actor.role === UserRole.DEPARTMENT_HEAD) {
    if (row.department?.headId === actor.id) {
      isDepartmentHead = true;
    } else {
      const dept = await prisma.department.findUnique({
        where: { id: row.departmentId },
        select: { headId: true },
      });
      if (dept?.headId === actor.id) {
        isDepartmentHead = true;
      }
    }
  }

  if (!isOwner && !isAdmin && !isDepartmentHead) {
    return null;
  }

  return toReservationRecord(row);
}

/**
 * Lists the authenticated employee's reservations filtered by tab.
 */
export async function listMyReservations(
  options: {
    tab?: ReservationTabFilter;
    page?: number;
    take?: number;
  } = {},
): Promise<ReservationListResult> {
  const actor = await requireAuthenticatedUser();
  const tab: ReservationTabFilter = options.tab ?? "upcoming";
  const page = Math.max(1, Number(options.page) || 1);
  const take = Math.min(50, Math.max(1, Number(options.take) || 20));
  const skip = (page - 1) * take;

  const now = new Date();

  let where: Prisma.ReservationWhereInput;
  let orderBy: Prisma.ReservationOrderByWithRelationInput[];

  switch (tab) {
    case "upcoming":
      where = {
        requesterId: actor.id,
        OR: [
          {
            status: {
              in: [
                ReservationStatus.PENDING,
                ReservationStatus.AWAITING_APPROVAL,
                ReservationStatus.APPROVED,
              ],
            },
          },
          {
            status: ReservationStatus.CONFIRMED,
            endTime: { gt: now },
          },
        ],
      };
      orderBy = [{ createdAt: "desc" }, { id: "desc" }];
      break;
    case "past":
      where = {
        requesterId: actor.id,
        status: ReservationStatus.CONFIRMED,
        endTime: { lte: now },
      };
      orderBy = [{ endTime: "desc" }, { id: "desc" }];
      break;
    case "cancelled":
      where = {
        requesterId: actor.id,
        status: {
          in: [ReservationStatus.CANCELLED, ReservationStatus.REJECTED],
        },
      };
      orderBy = [{ updatedAt: "desc" }, { id: "desc" }];
      break;
    case "all":
    default:
      where = {
        requesterId: actor.id,
      };
      orderBy = [{ createdAt: "desc" }, { id: "desc" }];
      break;
  }

  const [rows, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      include: reservationInclude,
      orderBy,
      take,
      skip,
    }),
    prisma.reservation.count({ where }),
  ]);

  return {
    reservations: rows.map((r) => toReservationRecord(r, now)),
    total,
    tab,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
  };
}

/**
 * Lists reservation requests for Admin management.
 */
export async function listAdminReservationRequests(
  options: {
    tab?: AdminReservationQueueTab;
    page?: number;
    take?: number;
  } = {},
): Promise<ReservationListResult> {
  await requireRole(UserRole.ADMIN);
  const tab = options.tab ?? "pending";
  const page = Math.max(1, Number(options.page) || 1);
  const take = Math.min(50, Math.max(1, Number(options.take) || 20));
  const skip = (page - 1) * take;

  const now = new Date();

  let where: Prisma.ReservationWhereInput;
  let orderBy: Prisma.ReservationOrderByWithRelationInput[];

  switch (tab) {
    case "pending":
      where = { status: ReservationStatus.PENDING };
      orderBy = [{ createdAt: "asc" }, { id: "asc" }];
      break;
    case "awaiting_hod":
      where = { status: ReservationStatus.AWAITING_APPROVAL };
      orderBy = [{ updatedAt: "asc" }, { id: "asc" }];
      break;
    case "approved":
      where = { status: ReservationStatus.APPROVED };
      orderBy = [{ startTime: "asc" }, { id: "asc" }];
      break;
    case "all":
    default:
      where = {
        status: {
          in: [
            ReservationStatus.PENDING,
            ReservationStatus.AWAITING_APPROVAL,
            ReservationStatus.APPROVED,
            ReservationStatus.CONFIRMED,
            ReservationStatus.REJECTED,
            ReservationStatus.CANCELLED,
          ],
        },
      };
      orderBy = [{ createdAt: "desc" }, { id: "desc" }];
      break;
  }

  const [rows, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      include: reservationInclude,
      orderBy,
      take,
      skip,
    }),
    prisma.reservation.count({ where }),
  ]);

  return {
    reservations: rows.map((r) => toReservationRecord(r, now)),
    total,
    tab,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
  };
}

/**
 * Lists requests awaiting Department Head approval for departments led by the authenticated actor.
 */
export async function listHodApprovalQueue(
  options: {
    tab?: string;
    page?: number;
    take?: number;
  } = {},
): Promise<ReservationListResult> {
  const actor = await requireAuthenticatedUser();
  const page = Math.max(1, Number(options.page) || 1);
  const take = Math.min(50, Math.max(1, Number(options.take) || 20));
  const skip = (page - 1) * take;

  // Find all departments led by this actor
  const departments = await prisma.department.findMany({
    where: { headId: actor.id },
    select: { id: true },
  });

  const departmentIds = departments.map((d) => d.id);
  const tab = options.tab ?? "pending";
  const now = new Date();

  if (departmentIds.length === 0) {
    return {
      reservations: [],
      total: 0,
      tab,
      page: 1,
      pages: 1,
    };
  }

  let where: Prisma.ReservationWhereInput;
  let orderBy: Prisma.ReservationOrderByWithRelationInput[];

  if (tab === "history") {
    where = {
      departmentId: { in: departmentIds },
      status: {
        in: [
          ReservationStatus.APPROVED,
          ReservationStatus.REJECTED,
          ReservationStatus.CONFIRMED,
          ReservationStatus.CANCELLED,
        ],
      },
    };
    orderBy = [{ updatedAt: "desc" }, { id: "desc" }];
  } else {
    // "pending" tab: Awaiting HOD approval
    where = {
      departmentId: { in: departmentIds },
      status: ReservationStatus.AWAITING_APPROVAL,
    };
    orderBy = [{ updatedAt: "asc" }, { id: "asc" }];
  }

  const [rows, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      include: reservationInclude,
      orderBy,
      take,
      skip,
    }),
    prisma.reservation.count({ where }),
  ]);

  return {
    reservations: rows.map((r) => toReservationRecord(r, now)),
    total,
    tab,
    page,
    pages: Math.max(1, Math.ceil(total / take)),
  };
}
