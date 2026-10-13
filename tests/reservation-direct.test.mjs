import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import * as React from "react";
import { loadSource } from "./helpers/source.mjs";

const reservationEnums = loadSource("src/generated/prisma/enums.ts", {});
const reservationValidation = loadSource("src/lib/reservation-validation.ts", {
  "@/generated/prisma/enums": reservationEnums,
  "@/lib/reservation-types": {},
});

const employeeId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const otherEmployeeId = "33333333-3333-4333-8333-333333333333";
const departmentId = "44444444-4444-4444-8444-444444444444";
const otherDepartmentId = "55555555-5555-4555-8555-555555555555";
const directCategoryId = "66666666-6666-4666-8666-666666666666";
const vehicleCategoryId = "77777777-7777-4777-8777-777777777777";
const eligibleResourceId = "88888888-8888-4888-8888-888888888888";
const approvalResourceId = "99999999-9999-4999-8999-999999999999";
const vehicleResourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const inactiveResourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createMockReservationFixture(options = {}) {
  let state = {
    users: [
      {
        id: employeeId,
        employeeId: "EMP001",
        name: "Alice Engineer",
        email: "alice@example.com",
        role: "EMPLOYEE",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId,
        ...options.actor,
      },
      {
        id: adminId,
        employeeId: "ADM001",
        name: "Bob Admin",
        email: "admin@example.com",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId,
      },
      {
        id: otherEmployeeId,
        employeeId: "EMP002",
        name: "Charlie Worker",
        email: "charlie@example.com",
        role: "EMPLOYEE",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: otherDepartmentId,
      },
    ],
    departments: [
      { id: departmentId, name: "Engineering", code: "ENG" },
      { id: otherDepartmentId, name: "Marketing", code: "MKT" },
    ],
    categories: [
      { id: directCategoryId, name: "Meeting Rooms", code: "ROOM", isVehicle: false },
      { id: vehicleCategoryId, name: "Fleet Vehicles", code: "VEH", isVehicle: true },
    ],
    resources: [
      {
        id: eligibleResourceId,
        name: "Conference Room Alpha",
        resourceCode: "ROOM_A",
        categoryId: directCategoryId,
        capacity: 10,
        location: "Level 2",
        isActive: true,
        requiresApproval: false,
      },
      {
        id: approvalResourceId,
        name: "Executive Boardroom",
        resourceCode: "ROOM_EXEC",
        categoryId: directCategoryId,
        capacity: 20,
        location: "Level 5",
        isActive: true,
        requiresApproval: true,
      },
      {
        id: vehicleResourceId,
        name: "Company Van 01",
        resourceCode: "VAN_01",
        categoryId: vehicleCategoryId,
        capacity: 8,
        location: "Garage",
        isActive: true,
        requiresApproval: false,
      },
      {
        id: inactiveResourceId,
        name: "Old Workshop",
        resourceCode: "SHOP_01",
        categoryId: directCategoryId,
        capacity: 5,
        location: "Basement",
        isActive: false,
        requiresApproval: false,
      },
    ],
    reservations: options.reservations ? [...options.reservations] : [],
  };

  let session = options.unauthenticated
    ? null
    : { user: { id: options.actor?.id ?? employeeId, sessionVersion: options.actor?.sessionVersion ?? 0 } };

  function selectRow(row, fields, db, isInclude = false) {
    if (!row) return null;
    if (!fields) return { ...row };
    const res = isInclude ? { ...row } : {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === "requester") {
        res.requester = selectRow(db.users.find((u) => u.id === row.requesterId), value.select, db);
      } else if (key === "department") {
        res.department = selectRow(db.departments.find((d) => d.id === row.departmentId), value.select, db);
      } else if (key === "requestedCategory") {
        res.requestedCategory = selectRow(db.categories.find((c) => c.id === row.requestedCategoryId), value.select, db);
      } else if (key === "resource") {
        res.resource = selectRow(db.resources.find((r) => r.id === row.resourceId), value.select, db);
      } else if (key === "category") {
        res.category = selectRow(db.categories.find((c) => c.id === row.categoryId), value.select, db);
      } else {
        res[key] = row[key];
      }
    }
    return res;
  }

  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((cond) => matches(row, cond));
      if (key === "AND") return value.every((cond) => matches(row, cond));
      if (value && typeof value === "object") {
        if (value.lt !== undefined) {
          const rowVal = new Date(row[key]);
          const target = new Date(value.lt);
          return rowVal < target;
        }
        if (value.gt !== undefined) {
          const rowVal = new Date(row[key]);
          const target = new Date(value.gt);
          return rowVal > target;
        }
        if (value.lte !== undefined) {
          const rowVal = new Date(row[key]);
          const target = new Date(value.lte);
          return rowVal <= target;
        }
        if (value.gte !== undefined) {
          const rowVal = new Date(row[key]);
          const target = new Date(value.gte);
          return rowVal >= target;
        }
        if (value.not !== undefined) {
          return row[key] !== value.not;
        }
      }
      return row[key] === value;
    });
  }

  const model = (table) => ({
    findUnique: async ({ where, include, select: fields }) => {
      const row = db[table].find((r) => r.id === where.id);
      return row ? selectRow(row, include ?? fields, db, !!include) : null;
    },
    findFirst: async ({ where, select: fields }) => {
      const row = db[table].find((r) => matches(r, where));
      return row ? selectRow(row, fields, db) : null;
    },
    findMany: async ({ where, include, select: fields, skip = 0, take = 50, orderBy }) => {
      let filtered = db[table].filter((r) => matches(r, where));
      if (orderBy && Array.isArray(orderBy)) {
        for (const order of orderBy) {
          const [field, dir] = Object.entries(order)[0];
          filtered.sort((a, b) => {
            const va = a[field] instanceof Date ? a[field].getTime() : a[field];
            const vb = b[field] instanceof Date ? b[field].getTime() : b[field];
            if (va < vb) return dir === "asc" ? -1 : 1;
            if (va > vb) return dir === "asc" ? 1 : -1;
            return 0;
          });
        }
      }
      return filtered.slice(skip, skip + take).map((r) => selectRow(r, include ?? fields, db, !!include));
    },
    count: async ({ where } = {}) => {
      return db[table].filter((r) => matches(r, where)).length;
    },
    create: async ({ data, select: fields }) => {
      if (options.simulateExclusionConflict) {
        const err = new Error("exclusion constraint violation");
        err.code = "23P01";
        throw err;
      }
      const now = new Date();
      const row = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      db[table].push(row);
      return selectRow(row, fields, db);
    },
    update: async ({ where, data }) => {
      const row = db[table].find((r) => r.id === where.id);
      if (!row) throw new Error("Record not found");
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
  });

  const db = {
    users: state.users,
    departments: state.departments,
    categories: state.categories,
    resources: state.resources,
    reservations: state.reservations,
  };

  const client = {
    user: model("users"),
    resourceCategory: model("categories"),
    resource: model("resources"),
    reservation: model("reservations"),
    async $transaction(fn) {
      if (Array.isArray(fn)) return Promise.all(fn);
      const tx = {
        user: model("users"),
        resourceCategory: model("categories"),
        resource: model("resources"),
        reservation: model("reservations"),
        $executeRaw: async () => 1,
        $queryRaw: async (strings, ...values) => {
          const sql = strings.join("?");
          if (sql.includes('SELECT r."id", r."categoryId"')) {
            const resId = values[0];
            const resource = db.resources.find((r) => r.id === resId);
            if (!resource) return [];
            const category = db.categories.find((c) => c.id === resource.categoryId);
            return [
              {
                id: resource.id,
                categoryId: resource.categoryId,
                isActive: resource.isActive,
                requiresApproval: resource.requiresApproval,
                isVehicle: category?.isVehicle ?? false,
              },
            ];
          }
          if (sql.includes('SELECT "id", "requesterId", "status"')) {
            const resId = values[0];
            const res = db.reservations.find((r) => r.id === resId);
            return res ? [res] : [];
          }
          return [];
        },
      };
      return fn(tx);
    },
  };

  const authorization = loadSource("src/lib/authorization.ts", {
    react: React,
    "@/auth": { auth: async () => session },
    "@/generated/prisma/enums": reservationEnums,
    "@/lib/prisma": { prisma: client },
  });

  const service = loadSource("src/lib/reservation-service.ts", {
    "@/generated/prisma/client": reservationEnums,
    "@/lib/authorization": authorization,
    "@/lib/prisma": { prisma: client },
    "@/lib/rate-limit": { enforceRateLimit: async () => {} },
    "@/lib/reservation-validation": reservationValidation,
    "@/lib/reservation-types": {},
  });

  return { service, client, authorization, state: () => state, setSession: (s) => (session = s) };
}

// ----------------------------------------------------
// 1. Validation and Timezone Tests
// ----------------------------------------------------
test("COLOMBO_TIMEZONE is Asia/Colombo", () => {
  assert.equal(reservationValidation.COLOMBO_TIMEZONE, "Asia/Colombo");
});

test("parseColomboDateTime correctly parses YYYY-MM-DD and HH:mm with +05:30 offset", () => {
  const parsed = reservationValidation.parseColomboDateTime("2026-10-20", "09:30");
  assert.ok(!isNaN(parsed.getTime()));
  // 09:30 in UTC+05:30 is 04:00:00 UTC
  assert.equal(parsed.toISOString(), "2026-10-20T04:00:00.000Z");
});

test("parseColomboDateTime rejects invalid date and time formats with appropriate field error", () => {
  assert.throws(
    () => reservationValidation.parseColomboDateTime("20-10-2026", "09:30"),
    (err) => err.field === "date",
  );
  assert.throws(
    () => reservationValidation.parseColomboDateTime("2026-10-20", "9:30"),
    (err) => err.field === "startTime",
  );
  assert.throws(
    () => reservationValidation.parseColomboDateTime("2026-10-20", "25:00", "endTime"),
    (err) => err.field === "endTime",
  );
});

test("validateBookingInterval enforces start < end and non-past intervals", () => {
  const fixedNow = new Date("2026-10-20T03:00:00.000Z"); // 08:30 Colombo
  const futureStart = new Date("2026-10-20T03:30:00.000Z"); // 09:00 Colombo
  const futureEnd = new Date("2026-10-20T04:30:00.000Z"); // 10:00 Colombo
  const pastStart = new Date("2026-10-20T02:00:00.000Z"); // 07:30 Colombo

  // Valid interval passes
  assert.doesNotThrow(() => {
    reservationValidation.validateBookingInterval(futureStart, futureEnd, fixedNow);
  });

  // start >= end fails
  assert.throws(
    () => reservationValidation.validateBookingInterval(futureEnd, futureStart, fixedNow),
    (err) => err.field === "endTime" && err.message.includes("End time must be after start time"),
  );
  assert.throws(
    () => reservationValidation.validateBookingInterval(futureStart, futureStart, fixedNow),
    (err) => err.field === "endTime",
  );

  // Past start time fails
  assert.throws(
    () => reservationValidation.validateBookingInterval(pastStart, futureEnd, fixedNow),
    (err) => err.field === "startTime" && err.message.includes("cannot be in the past"),
  );
});

test("parseDirectBookingInput validates complete input object and purpose length", () => {
  const fixedNow = new Date("2026-10-20T03:00:00.000Z");
  const validInput = {
    resourceId: eligibleResourceId,
    date: "2026-10-20",
    startTime: "09:30",
    endTime: "10:30",
    purpose: "Sprint Planning Meeting",
  };

  const parsed = reservationValidation.parseDirectBookingInput(validInput, fixedNow);
  assert.equal(parsed.resourceId, eligibleResourceId);
  assert.equal(parsed.date, "2026-10-20");
  assert.equal(parsed.startTime, "09:30");
  assert.equal(parsed.endTime, "10:30");
  assert.equal(parsed.purpose, "Sprint Planning Meeting");
  assert.equal(parsed.start.toISOString(), "2026-10-20T04:00:00.000Z");
  assert.equal(parsed.end.toISOString(), "2026-10-20T05:00:00.000Z");

  // Invalid UUID
  assert.throws(
    () => reservationValidation.parseDirectBookingInput({ ...validInput, resourceId: "not-uuid" }, fixedNow),
    (err) => err.field === "resourceId",
  );

  // Missing purpose
  assert.throws(
    () => reservationValidation.parseDirectBookingInput({ ...validInput, purpose: "   " }, fixedNow),
    (err) => err.field === "purpose",
  );

  // Oversized purpose > 1000 chars
  assert.throws(
    () => reservationValidation.parseDirectBookingInput({ ...validInput, purpose: "x".repeat(1001) }, fixedNow),
    (err) => err.field === "purpose",
  );
});

test("getDisplayReservationStatus computes COMPLETED only from elapsed CONFIRMED reservations", () => {
  const fixedNow = new Date("2026-10-20T12:00:00.000Z");
  const pastTime = new Date("2026-10-20T10:00:00.000Z");
  const futureTime = new Date("2026-10-20T14:00:00.000Z");

  // CONFIRMED in future -> CONFIRMED
  assert.equal(
    reservationValidation.getDisplayReservationStatus("CONFIRMED", futureTime, fixedNow),
    "CONFIRMED",
  );

  // CONFIRMED in past -> COMPLETED
  assert.equal(
    reservationValidation.getDisplayReservationStatus("CONFIRMED", pastTime, fixedNow),
    "COMPLETED",
  );

  // CANCELLED in past remains CANCELLED (never becomes COMPLETED)
  assert.equal(
    reservationValidation.getDisplayReservationStatus("CANCELLED", pastTime, fixedNow),
    "CANCELLED",
  );

  // PENDING in past remains PENDING
  assert.equal(
    reservationValidation.getDisplayReservationStatus("PENDING", pastTime, fixedNow),
    "PENDING",
  );
});

// ----------------------------------------------------
// 2. Direct Reservation Service Tests
// ----------------------------------------------------
test("createDirectReservation successfully creates CONFIRMED reservation with department snapshot", async () => {
  const fixture = createMockReservationFixture();
  const input = {
    resourceId: eligibleResourceId,
    date: "2099-01-15",
    startTime: "09:00",
    endTime: "10:30",
    purpose: "Architecture review",
  };

  const result = await fixture.service.createDirectReservation(input);
  assert.ok(result.reservationId);

  const saved = fixture.state().reservations.find((r) => r.id === result.reservationId);
  assert.ok(saved);
  assert.equal(saved.status, "CONFIRMED");
  assert.equal(saved.requesterId, employeeId);
  assert.equal(saved.departmentId, departmentId); // Snapshot of requester's department
  assert.equal(saved.requestedCategoryId, directCategoryId);
  assert.equal(saved.resourceId, eligibleResourceId);
  assert.equal(saved.purpose, "Architecture review");
});

test("createDirectReservation rejects ineligible resources (inactive, vehicle, approval-required)", async () => {
  const fixture = createMockReservationFixture();
  const baseInput = {
    date: "2099-01-15",
    startTime: "09:00",
    endTime: "10:30",
    purpose: "Testing eligibility",
  };

  // Inactive resource
  await assert.rejects(
    fixture.service.createDirectReservation({ ...baseInput, resourceId: inactiveResourceId }),
    (err) => err.message.includes("inactive"),
  );

  // Vehicle resource
  await assert.rejects(
    fixture.service.createDirectReservation({ ...baseInput, resourceId: vehicleResourceId }),
    (err) => err.message.includes("Vehicles cannot be booked directly"),
  );

  // Approval-required resource
  await assert.rejects(
    fixture.service.createDirectReservation({ ...baseInput, resourceId: approvalResourceId }),
    (err) => err.message.includes("requires managerial approval"),
  );
});

test("createDirectReservation detects overlapping intervals and allows back-to-back bookings", async () => {
  const fixture = createMockReservationFixture({
    reservations: [
      {
        id: randomUUID(),
        resourceId: eligibleResourceId,
        requesterId: otherEmployeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date("2099-01-15T03:30:00.000Z"), // 09:00 Colombo
        endTime: new Date("2099-01-15T04:30:00.000Z"),   // 10:00 Colombo
        purpose: "Prior reservation",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  // Overlapping interval: 09:30 - 10:30
  await assert.rejects(
    fixture.service.createDirectReservation({
      resourceId: eligibleResourceId,
      date: "2099-01-15",
      startTime: "09:30",
      endTime: "10:30",
      purpose: "Conflicting slot",
    }),
    (err) =>
      err.field === undefined &&
      err.message.includes("already booked for the selected time"),
  );

  // Back-to-back interval (immediately adjacent): 10:00 - 11:00 should succeed!
  const adjacentResult = await fixture.service.createDirectReservation({
    resourceId: eligibleResourceId,
    date: "2099-01-15",
    startTime: "10:00",
    endTime: "11:00",
    purpose: "Adjacent slot",
  });
  assert.ok(adjacentResult.reservationId);
});

test("createDirectReservation translates PostgreSQL exclusion constraint violation (23P01) to friendly error", async () => {
  const fixture = createMockReservationFixture({ simulateExclusionConflict: true });
  await assert.rejects(
    fixture.service.createDirectReservation({
      resourceId: eligibleResourceId,
      date: "2099-01-15",
      startTime: "09:00",
      endTime: "10:00",
      purpose: "Concurrent race simulation",
    }),
    (err) =>
      err.field === undefined &&
      err.message.includes("already booked for the selected time"),
  );
});

// ----------------------------------------------------
// 3. Cancellation Tests
// ----------------------------------------------------
test("cancelReservation allows requester or Admin to cancel active reservation", async () => {
  const reservationId = randomUUID();
  const fixture = createMockReservationFixture({
    reservations: [
      {
        id: reservationId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date("2099-01-15T03:30:00.000Z"),
        endTime: new Date("2099-01-15T04:30:00.000Z"),
        purpose: "Will cancel",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  // Owner cancels
  const result = await fixture.service.cancelReservation(reservationId);
  assert.equal(result.id, reservationId);
  assert.equal(fixture.state().reservations[0].status, "CANCELLED");

  // Re-cancelling fails
  await assert.rejects(
    fixture.service.cancelReservation(reservationId),
    (err) => err.message.includes("already been cancelled"),
  );
});

test("cancelReservation rejects non-owner employee from cancelling", async () => {
  const reservationId = randomUUID();
  const fixture = createMockReservationFixture({
    reservations: [
      {
        id: reservationId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date("2099-01-15T03:30:00.000Z"),
        endTime: new Date("2099-01-15T04:30:00.000Z"),
        purpose: "Alice's reservation",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  // Switch session to Charlie (different employee)
  fixture.setSession({ user: { id: otherEmployeeId, sessionVersion: 0 } });

  await assert.rejects(
    fixture.service.cancelReservation(reservationId),
    (err) => err.code === "FORBIDDEN" || err.message === "FORBIDDEN",
  );
});

test("cancelReservation rejects cancellation of already completed reservations", async () => {
  const reservationId = randomUUID();
  const fixture = createMockReservationFixture({
    reservations: [
      {
        id: reservationId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date("2020-01-15T03:30:00.000Z"),
        endTime: new Date("2020-01-15T04:30:00.000Z"), // Long past
        purpose: "Concluded meeting",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  await assert.rejects(
    fixture.service.cancelReservation(reservationId),
    (err) => err.message.includes("Completed reservations cannot be cancelled"),
  );
});

// ----------------------------------------------------
// 4. Scoped Retrieval and List Tests
// ----------------------------------------------------
test("getReservation enforces authorization scope (owner, admin, department head)", async () => {
  const reservationId = randomUUID();
  const fixture = createMockReservationFixture({
    reservations: [
      {
        id: reservationId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date("2099-01-15T03:30:00.000Z"),
        endTime: new Date("2099-01-15T04:30:00.000Z"),
        purpose: "Confidential meeting",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  // Owner can view
  const ownRecord = await fixture.service.getReservation(reservationId);
  assert.ok(ownRecord);
  assert.equal(ownRecord.id, reservationId);

  // Other employee cannot view
  fixture.setSession({ user: { id: otherEmployeeId, sessionVersion: 0 } });
  const otherRecord = await fixture.service.getReservation(reservationId);
  assert.equal(otherRecord, null);

  // Admin can view
  fixture.setSession({ user: { id: adminId, sessionVersion: 0 } });
  const adminRecord = await fixture.service.getReservation(reservationId);
  assert.ok(adminRecord);
  assert.equal(adminRecord.id, reservationId);
});

test("listMyReservations filters by tab and requester", async () => {
  const now = new Date();
  const upcomingId = randomUUID();
  const pastId = randomUUID();
  const cancelledId = randomUUID();

  const fixture = createMockReservationFixture({
    reservations: [
      {
        id: upcomingId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
        purpose: "Upcoming meeting",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: pastId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CONFIRMED",
        startTime: new Date(now.getTime() - 7200_000),
        endTime: new Date(now.getTime() - 3600_000),
        purpose: "Past meeting",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: cancelledId,
        resourceId: eligibleResourceId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: directCategoryId,
        status: "CANCELLED",
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
        purpose: "Cancelled meeting",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  const upcomingList = await fixture.service.listMyReservations({ tab: "upcoming" });
  assert.equal(upcomingList.total, 1);
  assert.equal(upcomingList.reservations[0].id, upcomingId);
  assert.equal(upcomingList.reservations[0].displayStatus, "CONFIRMED");

  const pastList = await fixture.service.listMyReservations({ tab: "past" });
  assert.equal(pastList.total, 1);
  assert.equal(pastList.reservations[0].id, pastId);
  assert.equal(pastList.reservations[0].displayStatus, "COMPLETED");

  const cancelledList = await fixture.service.listMyReservations({ tab: "cancelled" });
  assert.equal(cancelledList.total, 1);
  assert.equal(cancelledList.reservations[0].id, cancelledId);
  assert.equal(cancelledList.reservations[0].displayStatus, "CANCELLED");

  const allList = await fixture.service.listMyReservations({ tab: "all" });
  assert.equal(allList.total, 3);
});

// ----------------------------------------------------
// 5. Server Actions Tests
// ----------------------------------------------------
class RedirectSignal extends Error {
  constructor(url) {
    super(url);
    this.url = url;
  }
}

test("createDirectBookingAction redirects to detail page with created=1 and revalidates paths", async () => {
  const fixture = createMockReservationFixture();
  const revalidatedPaths = [];

  const actions = loadSource("src/app/reservation-actions.ts", {
    "next/cache": {
      revalidatePath: (path) => revalidatedPaths.push(path),
    },
    "next/navigation": {
      redirect: (url) => {
        throw new RedirectSignal(url);
      },
    },
    "@/lib/authorization": fixture.authorization,
    "@/lib/rate-limit": { RateLimitError: class extends Error {} },
    "@/lib/reservation-service": fixture.service,
    "@/lib/reservation-validation": reservationValidation,
    "@/lib/reservation-types": {},
  });

  const formData = new FormData();
  formData.set("resourceId", eligibleResourceId);
  formData.set("date", "2099-01-15");
  formData.set("startTime", "09:00");
  formData.set("endTime", "10:00");
  formData.set("purpose", "Server action booking test");

  await assert.rejects(
    actions.createDirectBookingAction({}, formData),
    (err) => err instanceof RedirectSignal && err.url.startsWith("/reservations/") && err.url.endsWith("?created=1"),
  );

  assert.ok(revalidatedPaths.includes("/reservations"));
  assert.ok(revalidatedPaths.includes("/dashboard"));
  assert.ok(revalidatedPaths.includes(`/resources/${eligibleResourceId}`));
});

test("createDirectBookingAction returns inline field errors on invalid inputs", async () => {
  const fixture = createMockReservationFixture();
  const actions = loadSource("src/app/reservation-actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => {} },
    "@/lib/authorization": fixture.authorization,
    "@/lib/rate-limit": { RateLimitError: class extends Error {} },
    "@/lib/reservation-service": fixture.service,
    "@/lib/reservation-validation": reservationValidation,
    "@/lib/reservation-types": {},
  });

  const formData = new FormData();
  formData.set("resourceId", eligibleResourceId);
  formData.set("date", "invalid-date");
  formData.set("startTime", "09:00");
  formData.set("endTime", "10:00");
  formData.set("purpose", "Testing invalid date");

  const result = await actions.createDirectBookingAction({}, formData);
  assert.ok(result.error);
  assert.ok(result.fieldErrors?.date);
});
