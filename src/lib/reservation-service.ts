import "server-only";

import {
  AccountStatus,
  ReservationStatus,
  UserRole,
  type Prisma,
} from "@/generated/prisma/client";
import { AuthorizationError, requireAuthenticatedUser } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import type {
  DirectBookingInput,
  ReservationListResult,
  ReservationRecord,
  ReservationTabFilter,
} from "@/lib/reservation-types";
import {
  ReservationError,
  getDisplayReservationStatus,
  isValidUuid,
  parseDirectBookingInput,
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
    },
  },
  requestedCategory: {
    select: categorySelect,
  },
  resource: {
    select: resourceSelect,
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
    str.includes("23P01") ||
    str.includes("Reservation_confirmed_resource_no_overlap")
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
    status: row.status,
    displayStatus: getDisplayReservationStatus(row.status, row.endTime, now),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requester: row.requester,
    department: row.department,
    requestedCategory: row.requestedCategory,
    resource: row.resource,
  };
}

/**
 * Returns resource details if it exists and can be inspected for booking.
 */
export async function getEligibleDirectResource(id: string) {
  await requireAuthenticatedUser();
  if (!isValidUuid(id)) return null;

  return prisma.resource.findUnique({
    where: { id },
    select: resourceSelect,
  });
}

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
            "This resource is already reserved during the requested time interval. Please choose another time slot.",
            "startTime",
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
        "This resource is already reserved during the requested time interval. Please choose another time slot.",
        "startTime",
      );
    }
    throw error;
  }
}

/**
 * Cancels a reservation.
 * Permitted for the original requester or an Administrator.
 * Only pending, approved, or unelapsed confirmed reservations can be cancelled.
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
  const isDepartmentHead =
    actor.role === UserRole.DEPARTMENT_HEAD && actor.departmentId === row.departmentId;

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
        status: ReservationStatus.CONFIRMED,
        endTime: { gt: now },
      };
      orderBy = [{ startTime: "asc" }, { id: "asc" }];
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
        status: ReservationStatus.CANCELLED,
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
