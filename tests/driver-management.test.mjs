import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadSource } from "./helpers/source.mjs";

const enums = loadSource("src/generated/prisma/enums.ts", {});
const driverValidation = loadSource("src/lib/driver-validation.ts", {});
const reservationValidation = loadSource("src/lib/reservation-validation.ts", {
  "@/generated/prisma/enums": enums,
  "@/lib/reservation-types": {},
});

const adminId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const hodId = "33333333-3333-4333-8333-333333333333";
const deptId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createDriverFixture(options = {}) {
  const db = {
    users: [
      {
        id: adminId,
        employeeId: "ADM001",
        name: "Admin Alice",
        email: "admin@example.com",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: deptId,
      },
      {
        id: employeeId,
        employeeId: "EMP001",
        name: "Bob Employee",
        email: "bob@example.com",
        role: "EMPLOYEE",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: deptId,
      },
      {
        id: hodId,
        employeeId: "HOD001",
        name: "Charlie Head",
        email: "charlie@example.com",
        role: "DEPARTMENT_HEAD",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: deptId,
      },
    ],
    drivers: options.drivers ?? [
      {
        id: "dddddddd-0001-4ddd-8ddd-dddddddddddd",
        name: "Sunil Perera",
        driverIdentifier: "DRV-001",
        phone: "+94 77 123 4567",
        email: "sunil@primewave.local",
        isActive: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "dddddddd-0002-4ddd-8ddd-dddddddddddd",
        name: "Kamal Silva",
        driverIdentifier: "DRV-002",
        phone: "+94 71 987 6543",
        email: null,
        isActive: false,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ],
    reservations: options.reservations ?? [],
  };

  let currentUser = db.users[0]; // Admin by default

  const mockPrisma = {
    driver: {
      findMany: async ({ where, orderBy } = {}) => {
        let results = [...db.drivers];
        if (where?.isActive !== undefined) {
          results = results.filter((d) => d.isActive === where.isActive);
        }
        if (where?.OR) {
          const search = where.OR[0]?.name?.contains?.toLowerCase() ?? "";
          results = results.filter(
            (d) =>
              d.name.toLowerCase().includes(search) ||
              d.driverIdentifier.toLowerCase().includes(search) ||
              d.phone.toLowerCase().includes(search) ||
              (d.email && d.email.toLowerCase().includes(search)),
          );
        }
        return results.map((d) => ({
          ...d,
          _count: {
            reservations: db.reservations.filter((r) => r.driverId === d.id).length,
          },
        }));
      },
      findUnique: async ({ where }) => {
        const d = db.drivers.find((driver) => driver.id === where.id);
        if (!d) return null;
        return {
          ...d,
          _count: {
            reservations: db.reservations.filter((r) => r.driverId === d.id).length,
          },
        };
      },
      findFirst: async ({ where }) => {
        return (
          db.drivers.find((d) => {
            if (where.id?.not && d.id === where.id.not) return false;
            if (where.driverIdentifier?.equals) {
              return (
                d.driverIdentifier.toLowerCase() ===
                where.driverIdentifier.equals.toLowerCase()
              );
            }
            return true;
          }) ?? null
        );
      },
      create: async ({ data, select }) => {
        const newDriver = {
          id: randomUUID(),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        db.drivers.push(newDriver);
        return { id: newDriver.id };
      },
      update: async ({ where, data, select }) => {
        const d = db.drivers.find((driver) => driver.id === where.id);
        if (!d) throw new Error("Driver not found");
        Object.assign(d, data, { updatedAt: new Date() });
        return { id: d.id };
      },
    },
    user: {
      findUnique: async ({ where }) => {
        return db.users.find((u) => u.id === where.id) ?? null;
      },
    },
    reservation: {
      groupBy: async () => [],
      count: async ({ where }) => {
        return db.reservations.filter((r) => r.driverId === where.driverId).length;
      },
    },
    $queryRaw: async (query, ...values) => {
      // Handle listAvailableDrivers query
      return db.drivers
        .filter((d) => d.isActive)
        .filter((d) => {
          // Check if driver has overlapping CONFIRMED reservation
          // For query: startTime < end AND endTime > start
          const end = values[0];
          const start = values[1];
          const hasOverlap = db.reservations.some(
            (r) =>
              r.driverId === d.id &&
              r.status === "CONFIRMED" &&
              r.startTime < end &&
              r.endTime > start,
          );
          return !hasOverlap;
        })
        .map((d) => ({
          id: d.id,
          name: d.name,
          driverIdentifier: d.driverIdentifier,
          phone: d.phone,
          email: d.email,
        }));
    },
    $transaction: async (fn) => {
      return fn(mockPrisma);
    },
  };

  const service = loadSource("src/lib/driver-service.ts", {
    "server-only": {},
    "@/generated/prisma/client": {
      AccountStatus: { ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" },
      ReservationStatus: {
        PENDING: "PENDING",
        AWAITING_APPROVAL: "AWAITING_APPROVAL",
        APPROVED: "APPROVED",
        CONFIRMED: "CONFIRMED",
        REJECTED: "REJECTED",
        CANCELLED: "CANCELLED",
      },
      UserRole: { ADMIN: "ADMIN", DEPARTMENT_HEAD: "DEPARTMENT_HEAD", EMPLOYEE: "EMPLOYEE" },
    },
    "@/lib/authorization": {
      AuthorizationError: class AuthorizationError extends Error {
        constructor(message = "FORBIDDEN", status = 403) {
          super(message);
          this.name = "AuthorizationError";
          this.status = status;
        }
      },
      requireRole: async (role) => {
        if (!currentUser || currentUser.role !== role) {
          const err = new Error("FORBIDDEN");
          err.name = "AuthorizationError";
          err.status = 403;
          throw err;
        }
        return currentUser;
      },
      requireAuthenticatedUser: async () => {
        if (!currentUser) throw new Error("UNAUTHORIZED");
        return currentUser;
      },
    },
    "@/lib/prisma": { prisma: mockPrisma },
    "@/lib/rate-limit": { enforceRateLimit: async () => {} },
    "@/lib/driver-types": {},
    "@/lib/driver-validation": driverValidation,
  });

  return {
    service,
    db,
    setUser: (user) => {
      currentUser = user;
    },
  };
}

// -----------------------------------------------------------------------------
// TESTS
// -----------------------------------------------------------------------------

test("1. Passenger count validation accepts positive integers and rejects invalid values", () => {
  const { validatePassengerCount } = reservationValidation;

  assert.equal(validatePassengerCount(1), 1);
  assert.equal(validatePassengerCount("4"), 4);
  assert.equal(validatePassengerCount(25), 25);
  assert.equal(validatePassengerCount(null, false), null);
  assert.equal(validatePassengerCount("", false), null);
  assert.equal(validatePassengerCount(undefined, false), null);

  // Rejections
  assert.throws(() => validatePassengerCount(0), /positive number/i);
  assert.throws(() => validatePassengerCount(-5), /positive number/i);
  assert.throws(() => validatePassengerCount(3.14), /positive number/i);
  assert.throws(() => validatePassengerCount("invalid"), /positive number/i);
  assert.throws(() => validatePassengerCount(201), /exceeds maximum/i);

  // Required check
  assert.throws(() => validatePassengerCount(null, true), /required/i);
  assert.throws(() => validatePassengerCount("", true), /required/i);
});

test("2. Admin can create a new driver with valid details", async () => {
  const fixture = createDriverFixture();

  const result = await fixture.service.createDriver({
    name: "Nimal Fernando",
    driverIdentifier: "drv-003",
    phone: "+94 77 555 1234",
    email: "nimal@primewave.local",
  });

  assert.ok(result.driverId);
  const created = fixture.db.drivers.find((d) => d.id === result.driverId);
  assert.ok(created);
  assert.equal(created.name, "Nimal Fernando");
  assert.equal(created.driverIdentifier, "DRV-003"); // normalized to uppercase
  assert.equal(created.phone, "+94 77 555 1234");
  assert.equal(created.email, "nimal@primewave.local");
  assert.equal(created.isActive, true);
});

test("3. Driver creation rejects duplicate driver identifier (case-insensitive)", async () => {
  const fixture = createDriverFixture();

  await assert.rejects(
    fixture.service.createDriver({
      name: "Another Driver",
      driverIdentifier: "drv-001", // already exists as DRV-001
      phone: "+94 77 000 0000",
    }),
    /already in use/i,
  );
});

test("4. Driver input validation enforces name, identifier, and sensible phone format", () => {
  const { validateDriverName, validateDriverIdentifier, validateDriverPhone, validateDriverEmail } =
    driverValidation;

  // Name
  assert.throws(() => validateDriverName(""), /name is required/i);
  assert.throws(() => validateDriverName("A"), /at least 2 characters/i);
  assert.equal(validateDriverName("  Valid Name  "), "Valid Name");

  // Identifier
  assert.throws(() => validateDriverIdentifier(""), /identifier is required/i);
  assert.throws(() => validateDriverIdentifier("D"), /2–20 alphanumeric/i);
  assert.throws(() => validateDriverIdentifier("DRV@001"), /2–20 alphanumeric/i);
  assert.equal(validateDriverIdentifier("drv-101"), "DRV-101");

  // Phone: Sensible international validation
  assert.throws(() => validateDriverPhone(""), /phone number is required/i);
  assert.throws(() => validateDriverPhone("123"), /valid phone number/i); // too short
  assert.throws(() => validateDriverPhone("letters-not-allowed"), /valid phone number/i);
  assert.equal(validateDriverPhone("+94 77 123 4567"), "+94 77 123 4567");
  assert.equal(validateDriverPhone("071-2345678"), "071-2345678");

  // Email (optional)
  assert.equal(validateDriverEmail(""), null);
  assert.equal(validateDriverEmail(null), null);
  assert.throws(() => validateDriverEmail("invalid-email"), /valid email/i);
  assert.equal(validateDriverEmail("TEST@Example.COM"), "test@example.com");
});

test("5. Admin can update driver profile details", async () => {
  const fixture = createDriverFixture();
  const driverId = "dddddddd-0001-4ddd-8ddd-dddddddddddd";

  await fixture.service.updateDriver(driverId, {
    name: "Sunil P. Updated",
    driverIdentifier: "DRV-001",
    phone: "+94 77 999 8888",
    email: "sunil.updated@primewave.local",
  });

  const updated = fixture.db.drivers.find((d) => d.id === driverId);
  assert.equal(updated.name, "Sunil P. Updated");
  assert.equal(updated.phone, "+94 77 999 8888");
  assert.equal(updated.email, "sunil.updated@primewave.local");
});

test("6. Driver update rejects identifier collision with another driver", async () => {
  const fixture = createDriverFixture();
  const driverId = "dddddddd-0001-4ddd-8ddd-dddddddddddd";

  // Try to update DRV-001 to DRV-002 (which belongs to Kamal)
  await assert.rejects(
    fixture.service.updateDriver(driverId, {
      name: "Sunil",
      driverIdentifier: "drv-002",
      phone: "+94 77 123 4567",
    }),
    /already in use by another driver/i,
  );
});

test("7. Admin can deactivate and reactivate a driver without deleting assignments", async () => {
  const fixture = createDriverFixture();
  const driverId = "dddddddd-0001-4ddd-8ddd-dddddddddddd";

  // Deactivate
  await fixture.service.setDriverActiveStatus(driverId, false);
  let driver = fixture.db.drivers.find((d) => d.id === driverId);
  assert.equal(driver.isActive, false);

  // Reactivate
  await fixture.service.setDriverActiveStatus(driverId, true);
  driver = fixture.db.drivers.find((d) => d.id === driverId);
  assert.equal(driver.isActive, true);
});

test("8. Non-Admin users (Employee, HOD) are rejected from driver management", async () => {
  const fixture = createDriverFixture();

  // Employee
  fixture.setUser(fixture.db.users[1]);
  await assert.rejects(
    fixture.service.createDriver({
      name: "Unauthorized Driver",
      driverIdentifier: "DRV-999",
      phone: "+94 77 000 0000",
    }),
    (err) => err.name === "AuthorizationError" || err.message === "FORBIDDEN",
  );

  await assert.rejects(
    fixture.service.listDrivers(),
    (err) => err.name === "AuthorizationError" || err.message === "FORBIDDEN",
  );

  // HOD
  fixture.setUser(fixture.db.users[2]);
  await assert.rejects(
    fixture.service.setDriverActiveStatus("dddddddd-0001-4ddd-8ddd-dddddddddddd", false),
    (err) => err.name === "AuthorizationError" || err.message === "FORBIDDEN",
  );
});

test("9. Inactive drivers are excluded from available driver allocation query", async () => {
  const fixture = createDriverFixture();

  const start = new Date("2026-10-20T09:00:00Z");
  const end = new Date("2026-10-20T11:00:00Z");

  const available = await fixture.service.listAvailableDrivers(start, end);

  // Kamal Silva (DRV-002) is inactive, so only Sunil Perera (DRV-001) should be available
  assert.equal(available.length, 1);
  assert.equal(available[0].driverIdentifier, "DRV-001");
});

test("10. Driver with overlapping CONFIRMED reservation is excluded from available query", async () => {
  const fixture = createDriverFixture({
    reservations: [
      {
        id: "r1",
        driverId: "dddddddd-0001-4ddd-8ddd-dddddddddddd",
        status: "CONFIRMED",
        startTime: new Date("2026-10-20T10:00:00Z"),
        endTime: new Date("2026-10-20T12:00:00Z"),
      },
    ],
  });

  // Query overlapping interval [09:00, 11:00)
  const available = await fixture.service.listAvailableDrivers(
    new Date("2026-10-20T09:00:00Z"),
    new Date("2026-10-20T11:00:00Z"),
  );

  assert.equal(available.length, 0); // Sunil is busy, Kamal is inactive

  // Query adjacent interval [08:00, 10:00) - half open [) allows adjacent!
  const availableAdjacent = await fixture.service.listAvailableDrivers(
    new Date("2026-10-20T08:00:00Z"),
    new Date("2026-10-20T10:00:00Z"),
  );

  assert.equal(availableAdjacent.length, 1);
  assert.equal(availableAdjacent[0].driverIdentifier, "DRV-001");
});

test("11. Additive migration file exists and contains positive passenger count check constraint", () => {
  const migrationPath = path.resolve(
    "prisma/migrations/20261015000000_add_passenger_count/migration.sql",
  );
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");

  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /ALTER TABLE "Reservation" ADD COLUMN "passengerCount" INTEGER;/);
  assert.match(sql, /Reservation_positive_passenger_count_check/);
  assert.match(sql, /CHECK \("passengerCount" IS NULL OR "passengerCount" > 0\);/);
});
