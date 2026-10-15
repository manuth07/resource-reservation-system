import "server-only";

import {
  AccountStatus,
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
  DriverFilterOptions,
  DriverRecord,
  SaveDriverInput,
} from "@/lib/driver-types";
import {
  DriverError,
  isValidUuid,
  validateDriverEmail,
  validateDriverIdentifier,
  validateDriverName,
  validateDriverPhone,
} from "@/lib/driver-validation";

const driverSelect = {
  id: true,
  name: true,
  driverIdentifier: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      reservations: true,
    },
  },
} as const;

function toDriverRecord(
  row: Prisma.DriverGetPayload<{ select: typeof driverSelect }>,
  activeCount = 0,
): DriverRecord {
  return {
    id: row.id,
    name: row.name,
    driverIdentifier: row.driverIdentifier,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    reservationCount: row._count.reservations,
    activeReservationCount: activeCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Lists all drivers in the system with optional search and active-status filter.
 * Restricted to authenticated Administrators.
 */
export async function listDrivers(
  filters?: DriverFilterOptions,
): Promise<DriverRecord[]> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("driver-query", actor.id, 60, 60_000);

  const search = filters?.q?.trim();
  const statusFilter = filters?.status ?? "ALL";

  const where: Prisma.DriverWhereInput = {
    ...(statusFilter === "ALL"
      ? {}
      : { isActive: statusFilter === "ACTIVE" }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { driverIdentifier: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const rows = await prisma.driver.findMany({
    where,
    select: driverSelect,
    orderBy: [{ name: "asc" }, { driverIdentifier: "asc" }],
  });

  // Calculate active reservation counts for current/upcoming reservations
  const now = new Date();
  const driverIds = rows.map((r) => r.id);

  const activeReservations = driverIds.length > 0
    ? await prisma.reservation.groupBy({
        by: ["driverId"],
        where: {
          driverId: { in: driverIds },
          status: {
            in: [
              ReservationStatus.PENDING,
              ReservationStatus.AWAITING_APPROVAL,
              ReservationStatus.APPROVED,
              ReservationStatus.CONFIRMED,
            ],
          },
          endTime: { gte: now },
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const activeCountMap = new Map<string, number>();
  for (const item of activeReservations) {
    if (item.driverId) {
      activeCountMap.set(item.driverId, item._count._all);
    }
  }

  return rows.map((r) => toDriverRecord(r, activeCountMap.get(r.id) ?? 0));
}

/**
 * Retrieves a single driver record by ID.
 * Restricted to authenticated Administrators.
 */
export async function getDriver(id: string): Promise<DriverRecord | null> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("driver-query", actor.id, 60, 60_000);

  if (!isValidUuid(id)) return null;

  const row = await prisma.driver.findUnique({
    where: { id },
    select: driverSelect,
  });

  if (!row) return null;

  const now = new Date();
  const activeCount = await prisma.reservation.count({
    where: {
      driverId: row.id,
      status: {
        in: [
          ReservationStatus.PENDING,
          ReservationStatus.AWAITING_APPROVAL,
          ReservationStatus.APPROVED,
          ReservationStatus.CONFIRMED,
        ],
      },
      endTime: { gte: now },
    },
  });

  return toDriverRecord(row, activeCount);
}

/**
 * Creates a new Driver profile.
 * Restricted to authenticated, active Administrators with password changed.
 */
export async function createDriver(
  input: SaveDriverInput,
): Promise<{ driverId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("driver-mutation", actor.id, 30, 60_000);

  const name = validateDriverName(input.name);
  const driverIdentifier = validateDriverIdentifier(input.driverIdentifier);
  const phone = validateDriverPhone(input.phone);
  const email = validateDriverEmail(input.email);

  return prisma.$transaction(
    async (tx) => {
      // Re-verify actor security state under transaction
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

      // Check unique identifier case-insensitively
      const existing = await tx.driver.findFirst({
        where: {
          driverIdentifier: { equals: driverIdentifier, mode: "insensitive" },
        },
        select: { id: true, driverIdentifier: true },
      });

      if (existing) {
        throw new DriverError(
          `Driver identifier "${driverIdentifier}" is already in use. Please enter a unique identifier.`,
          "driverIdentifier",
        );
      }

      const created = await tx.driver.create({
        data: {
          name,
          driverIdentifier,
          phone,
          email,
          isActive: true,
        },
        select: { id: true },
      });

      return { driverId: created.id };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Updates an existing Driver profile.
 * Restricted to authenticated, active Administrators with password changed.
 */
export async function updateDriver(
  id: string,
  input: SaveDriverInput,
): Promise<{ driverId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("driver-mutation", actor.id, 30, 60_000);

  if (!isValidUuid(id)) {
    throw new DriverError("Invalid driver identifier.", undefined, 404);
  }

  const name = validateDriverName(input.name);
  const driverIdentifier = validateDriverIdentifier(input.driverIdentifier);
  const phone = validateDriverPhone(input.phone);
  const email = validateDriverEmail(input.email);

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

      const existingDriver = await tx.driver.findUnique({
        where: { id },
        select: { id: true, driverIdentifier: true },
      });

      if (!existingDriver) {
        throw new DriverError("Driver not found.", undefined, 404);
      }

      // Check collision with other drivers
      const duplicate = await tx.driver.findFirst({
        where: {
          id: { not: id },
          driverIdentifier: { equals: driverIdentifier, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new DriverError(
          `Driver identifier "${driverIdentifier}" is already in use by another driver.`,
          "driverIdentifier",
        );
      }

      const updated = await tx.driver.update({
        where: { id },
        data: {
          name,
          driverIdentifier,
          phone,
          email,
        },
        select: { id: true },
      });

      return { driverId: updated.id };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Activates or deactivates a driver.
 * Deactivation preserves all historical reservations and assignments,
 * but prevents any future allocation of this driver.
 * Restricted to authenticated, active Administrators with password changed.
 */
export async function setDriverActiveStatus(
  id: string,
  isActive: boolean,
): Promise<{ driverId: string }> {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("driver-mutation", actor.id, 30, 60_000);

  if (!isValidUuid(id)) {
    throw new DriverError("Invalid driver identifier.", undefined, 404);
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

      const existingDriver = await tx.driver.findUnique({
        where: { id },
        select: { id: true, isActive: true },
      });

      if (!existingDriver) {
        throw new DriverError("Driver not found.", undefined, 404);
      }

      if (existingDriver.isActive === isActive) {
        return { driverId: id };
      }

      const updated = await tx.driver.update({
        where: { id },
        data: { isActive },
        select: { id: true },
      });

      return { driverId: updated.id };
    },
    { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" },
  );
}

/**
 * Reusable Driver Availability Query (Prepares Phase 3B Vehicle Allocation).
 * Returns all active drivers who do NOT have any overlapping CONFIRMED reservation
 * in the requested interval [startTime, endTime).
 * Allows adjacent back-to-back reservations.
 */
export async function listAvailableDrivers(
  startTime: Date,
  endTime: Date,
): Promise<Array<{
  id: string;
  name: string;
  driverIdentifier: string;
  phone: string;
  email: string | null;
}>> {
  await requireAuthenticatedUser();

  const startMs = typeof startTime?.getTime === "function" ? startTime.getTime() : NaN;
  const endMs = typeof endTime?.getTime === "function" ? endTime.getTime() : NaN;

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    throw new DriverError("Invalid booking interval timestamps.");
  }

  if (endMs <= startMs) {
    throw new DriverError("End time must be after start time.");
  }

  // Active drivers who do NOT have an overlapping CONFIRMED reservation
  // Overlap condition: r.startTime < requestedEnd AND r.endTime > requestedStart
  const availableDrivers = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      driverIdentifier: string;
      phone: string;
      email: string | null;
    }>
  >`
    SELECT d."id", d."name", d."driverIdentifier", d."phone", d."email"
    FROM "public"."Driver" d
    WHERE d."isActive" = true
      AND NOT EXISTS (
        SELECT 1
        FROM "public"."Reservation" r
        WHERE r."driverId" = d."id"
          AND r."status" = 'CONFIRMED'::"ReservationStatus"
          AND r."startTime" < ${endTime}
          AND r."endTime" > ${startTime}
      )
    ORDER BY d."name" ASC;
  `;

  return availableDrivers;
}
