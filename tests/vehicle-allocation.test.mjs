import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { loadSource } from "./helpers/source.mjs";

const reservationEnums = loadSource("src/generated/prisma/enums.ts", {});
const reservationValidation = loadSource("src/lib/reservation-validation.ts", {
  "@/generated/prisma/enums": reservationEnums,
  "@/lib/reservation-types": {},
});

const employeeId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const hodId = "33333333-3333-4333-8333-333333333333";
const departmentId = "44444444-4444-4444-8444-444444444444";

const standardCategoryId = "55555555-5555-4555-8555-555555555555";
const vehicleCategoryId = "66666666-6666-4666-8666-666666666666";

const standardRoomId = "77777777-7777-4777-8777-777777777777";
const approvalRoomId = "88888888-8888-4888-8888-888888888888";
const vehicleVanLargeId = "99999999-9999-4999-8999-999999999999";
const vehicleCarSmallId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const vehicleInactiveId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const activeDriver1Id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const activeDriver2Id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const inactiveDriverId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function createAllocationFixture(options = {}) {
  const db = {
    users: [
      {
        id: employeeId,
        employeeId: "EMP001",
        name: "Edward Employee",
        email: "edward@example.com",
        role: "EMPLOYEE",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId,
      },
      {
        id: adminId,
        employeeId: "ADM001",
        name: "Arthur Admin",
        email: "admin@example.com",
        role: "ADMIN",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId,
      },
      {
        id: hodId,
        employeeId: "HOD001",
        name: "Helen Head",
        email: "helen@example.com",
        role: "DEPARTMENT_HEAD",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId,
      },
    ],
    departments: [
      { id: departmentId, name: "Engineering", code: "ENG", headId: hodId },
    ],
    categories: [
      { id: standardCategoryId, name: "Meeting Rooms", code: "ROOM", isVehicle: false },
      { id: vehicleCategoryId, name: "Fleet Vehicles", code: "VEH", isVehicle: true },
    ],
    resources: [
      {
        id: standardRoomId,
        name: "Conference Room A",
        resourceCode: "CONF_A",
        categoryId: standardCategoryId,
        capacity: 10,
        location: "Floor 2",
        isActive: true,
        requiresApproval: false,
      },
      {
        id: approvalRoomId,
        name: "Executive Boardroom",
        resourceCode: "EXEC_BOARD",
        categoryId: standardCategoryId,
        capacity: 20,
        location: "Floor 4",
        isActive: true,
        requiresApproval: true,
      },
      {
        id: vehicleVanLargeId,
        name: "Toyota HiAce Van 1",
        resourceCode: "VAN_01",
        categoryId: vehicleCategoryId,
        capacity: 14,
        location: "Transport Bay",
        isActive: true,
        requiresApproval: true,
      },
      {
        id: vehicleCarSmallId,
        name: "Toyota Corolla Car 1",
        resourceCode: "CAR_01",
        categoryId: vehicleCategoryId,
        capacity: 4,
        location: "Transport Bay",
        isActive: true,
        requiresApproval: true,
      },
      {
        id: vehicleInactiveId,
        name: "Maintenance Van",
        resourceCode: "VAN_MAINT",
        categoryId: vehicleCategoryId,
        capacity: 10,
        location: "Transport Bay",
        isActive: false,
        requiresApproval: true,
      },
    ],
    drivers: [
      {
        id: activeDriver1Id,
        name: "Sunil Silva",
        driverIdentifier: "DRV-001",
        phone: "0771234567",
        email: "sunil@primewave.lk",
        isActive: true,
      },
      {
        id: activeDriver2Id,
        name: "Nimal Fernando",
        driverIdentifier: "DRV-002",
        phone: "0772345678",
        email: "nimal@primewave.lk",
        isActive: true,
      },
      {
        id: inactiveDriverId,
        name: "Kamal Perera",
        driverIdentifier: "DRV-003",
        phone: "0773456789",
        email: "kamal@primewave.lk",
        isActive: false,
      },
    ],
    reservations: options.reservations ? [...options.reservations] : [],
    approvals: options.approvals ? [...options.approvals] : [],
  };

  let currentActorId = options.currentActorId ?? adminId;

  function selectRow(row, fields, database, isInclude = false) {
    if (!row) return null;
    if (!fields) return { ...row };
    const res = isInclude ? { ...row } : {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === "requester") {
        res.requester = selectRow(database.users.find((u) => u.id === row.requesterId), value.select, database);
      } else if (key === "department") {
        res.department = selectRow(database.departments.find((d) => d.id === row.departmentId), value.select, database);
      } else if (key === "requestedCategory") {
        res.requestedCategory = selectRow(database.categories.find((c) => c.id === row.requestedCategoryId), value.select, database);
      } else if (key === "resource") {
        res.resource = selectRow(database.resources.find((r) => r.id === row.resourceId), value.select, database);
      } else if (key === "driver") {
        res.driver = selectRow(database.drivers.find((d) => d.id === row.driverId), value.select, database);
      } else if (key === "approvals") {
        const apps = database.approvals.filter((a) => a.reservationId === row.id);
        res.approvals = apps.map((a) => selectRow(a, value.include, database, true));
      } else if (key === "approver") {
        res.approver = selectRow(database.users.find((u) => u.id === row.approverId), value.select, database);
      } else if (key === "head") {
        res.head = selectRow(database.users.find((u) => u.id === row.headId), value.select, database);
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
      if (key === "reservationId_stage") {
        return row.reservationId === value.reservationId && row.stage === value.stage;
      }
      if (key === "category" && value && value.isVehicle !== undefined) {
        const cat = db.categories.find((c) => c.id === row.categoryId);
        return cat && cat.isVehicle === value.isVehicle;
      }
      if (key === "reservations" && value && value.none) {
        const hasConflict = db.reservations.some(
          (res) =>
            res.resourceId === row.id &&
            res.status === value.none.status &&
            new Date(res.startTime) < new Date(value.none.startTime.lt) &&
            new Date(res.endTime) > new Date(value.none.endTime.gt),
        );
        return !hasConflict;
      }
      if (value && typeof value === "object") {
        if (value.lt !== undefined) {
          const rowVal = new Date(row[key]);
          return rowVal < new Date(value.lt);
        }
        if (value.gt !== undefined) {
          const rowVal = new Date(row[key]);
          return rowVal > new Date(value.gt);
        }
        if (value.lte !== undefined) {
          const rowVal = new Date(row[key]);
          return rowVal <= new Date(value.lte);
        }
        if (value.gte !== undefined) {
          const rowVal = new Date(row[key]);
          return rowVal >= new Date(value.gte);
        }
        if (value.not !== undefined) {
          return row[key] !== value.not;
        }
        if (Array.isArray(value.in)) {
          return value.in.includes(row[key]);
        }
      }
      return row[key] === value;
    });
  }

  const model = (table) => ({
    findUnique: async ({ where, include, select: fields }) => {
      const row = db[table].find((r) => matches(r, where));
      return row ? selectRow(row, include ?? fields, db, !!include) : null;
    },
    findFirst: async ({ where, include, select: fields }) => {
      const row = db[table].find((r) => matches(r, where));
      return row ? selectRow(row, include ?? fields, db, !!include) : null;
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
      const now = new Date();
      const row = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        decidedAt: now,
        ...data,
      };
      db[table].push(row);
      return selectRow(row, fields, db);
    },
    update: async ({ where, data }) => {
      const row = db[table].find((r) => r.id === where.id);
      if (!row) throw new Error(`${table} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  });

  const prismaMock = {
    user: model("users"),
    department: model("departments"),
    resourceCategory: model("categories"),
    resource: model("resources"),
    driver: model("drivers"),
    reservation: model("reservations"),
    approval: model("approvals"),
    $transaction: async (arg) => {
      if (typeof arg === "function") {
        return arg({
          ...prismaMock,
          $queryRaw: async (strings, ...values) => {
            const rawSql = String(strings);
            if (rawSql.includes('FROM "public"."Resource"')) {
              const resId = values[0];
              const r = db.resources.find((res) => res.id === resId);
              if (!r) return [];
              const cat = db.categories.find((c) => c.id === r.categoryId);
              return [{
                id: r.id,
                categoryId: r.categoryId,
                capacity: r.capacity,
                isActive: r.isActive,
                name: r.name,
                resourceCode: r.resourceCode,
                requiresApproval: r.requiresApproval,
                isVehicle: cat ? cat.isVehicle : false,
              }];
            }
            if (rawSql.includes('FROM "public"."Driver"')) {
              const driverId = values[0];
              const d = db.drivers.find((drv) => drv.id === driverId);
              if (!d) return [];
              return [{
                id: d.id,
                name: d.name,
                driverIdentifier: d.driverIdentifier,
                isActive: d.isActive,
              }];
            }
            if (rawSql.includes('FROM "public"."Reservation"')) {
              const resId = values[0];
              const r = db.reservations.find((res) => res.id === resId);
              if (!r) return [];
              const cat = db.categories.find((c) => c.id === r.requestedCategoryId);
              return [{
                id: r.id,
                status: r.status,
                departmentId: r.departmentId,
                requestedCategoryId: r.requestedCategoryId,
                resourceId: r.resourceId,
                driverId: r.driverId,
                startTime: r.startTime,
                endTime: r.endTime,
                passengerCount: r.passengerCount,
                isVehicle: cat ? cat.isVehicle : false,
              }];
            }
            return [];
          },
        });
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    },
  };

  const reservationService = loadSource("src/lib/reservation-service.ts", {
    "server-only": {},
    "@/generated/prisma/client": {
      AccountStatus: { ACTIVE: "ACTIVE", SUSPENDED: "SUSPENDED" },
      ApprovalDecision: { APPROVED: "APPROVED", REJECTED: "REJECTED" },
      ApprovalStage: {
        ADMIN_REVIEW: "ADMIN_REVIEW",
        DEPARTMENT_HEAD_APPROVAL: "DEPARTMENT_HEAD_APPROVAL",
        ADMIN_CONFIRMATION: "ADMIN_CONFIRMATION",
      },
      ReservationStatus: {
        PENDING: "PENDING",
        AWAITING_APPROVAL: "AWAITING_APPROVAL",
        APPROVED: "APPROVED",
        CONFIRMED: "CONFIRMED",
        CANCELLED: "CANCELLED",
        REJECTED: "REJECTED",
      },
      UserRole: { ADMIN: "ADMIN", DEPARTMENT_HEAD: "DEPARTMENT_HEAD", EMPLOYEE: "EMPLOYEE" },
    },
    "@/lib/authorization": {
      requireAuthenticatedUser: async () => {
        const u = db.users.find((user) => user.id === currentActorId);
        if (!u || u.accountStatus !== "ACTIVE") {
          const err = new Error("UNAUTHORIZED");
          err.status = 401;
          throw err;
        }
        return { ...u };
      },
      requireRole: async (role) => {
        const u = db.users.find((user) => user.id === currentActorId);
        if (!u || u.accountStatus !== "ACTIVE" || u.role !== role) {
          const err = new Error("FORBIDDEN");
          err.name = "AuthorizationError";
          err.status = 403;
          throw err;
        }
        return { ...u };
      },
      AuthorizationError: class extends Error {
        constructor(msg, status = 403) {
          super(msg);
          this.name = "AuthorizationError";
          this.status = status;
        }
      },
    },
    "@/lib/prisma": { prisma: prismaMock },
    "@/lib/rate-limit": { enforceRateLimit: async () => {} },
    "@/lib/reservation-types": {},
    "@/lib/reservation-validation": reservationValidation,
  });

  return {
    db,
    setActor: (id) => { currentActorId = id; },
    service: reservationService,
  };
}

function getFutureDate(days = 3) {
  const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return target.toISOString().split("T")[0];
}

async function createApprovedVehicleReservation(fixture, passengerCount = 4) {
  const futureDate = getFutureDate(3);
  fixture.setActor(employeeId);
  const { reservationId } = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "13:00",
    destination: "Kandy Regional Centre",
    purpose: "Provincial infrastructure inspection",
    passengerCount,
  });

  // Admin forward
  fixture.setActor(adminId);
  await fixture.service.adminForwardToHod(reservationId);

  // HOD approve
  fixture.setActor(hodId);
  await fixture.service.hodApproveRequest(reservationId);

  return reservationId;
}

test("1. Successful vehicle and driver allocation transitions to CONFIRMED and records audit", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);
  const result = await fixture.service.adminAllocateVehicleAndConfirm(
    resId,
    vehicleVanLargeId,
    activeDriver1Id,
  );

  assert.equal(result.reservationId, resId);
  assert.equal(result.resourceId, vehicleVanLargeId);
  assert.equal(result.driverId, activeDriver1Id);
  assert.equal(result.status, "CONFIRMED");

  const reservation = fixture.db.reservations.find((r) => r.id === resId);
  assert.equal(reservation.status, "CONFIRMED");
  assert.equal(reservation.resourceId, vehicleVanLargeId);
  assert.equal(reservation.driverId, activeDriver1Id);

  const confirmationApproval = fixture.db.approvals.find(
    (a) => a.reservationId === resId && a.stage === "ADMIN_CONFIRMATION",
  );
  assert.ok(confirmationApproval);
  assert.equal(confirmationApproval.decision, "APPROVED");
  assert.equal(confirmationApproval.approverId, adminId);
});

test("2. Rejects allocation when vehicle belongs to wrong category", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      // standardRoomId belongs to meeting room category, not vehicle
      await fixture.service.adminAllocateVehicleAndConfirm(resId, standardRoomId, activeDriver1Id);
    },
    (err) => {
      assert.match(err.message, /requested vehicle category/i);
      assert.equal(err.field, "resourceId");
      return true;
    },
  );
});

test("3. Rejects allocation when vehicle capacity is insufficient for passenger count", async () => {
  const fixture = createAllocationFixture();
  // Request with 6 passengers
  const resId = await createApprovedVehicleReservation(fixture, 6);

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      // vehicleCarSmallId capacity is 4, but requested is 6
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleCarSmallId, activeDriver1Id);
    },
    (err) => {
      assert.match(err.message, /insufficient for 6 passengers/i);
      assert.equal(err.field, "resourceId");
      return true;
    },
  );
});

test("4. Rejects allocation when vehicle is inactive", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleInactiveId, activeDriver1Id);
    },
    (err) => {
      assert.match(err.message, /inactive/i);
      assert.equal(err.field, "resourceId");
      return true;
    },
  );
});

test("5. Rejects allocation when driver is inactive", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, inactiveDriverId);
    },
    (err) => {
      assert.match(err.message, /inactive/i);
      assert.equal(err.field, "driverId");
      return true;
    },
  );
});

test("6. Rejects allocation when vehicle has overlapping confirmed reservation", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  const res = fixture.db.reservations.find((r) => r.id === resId);

  // Create an overlapping confirmed reservation with the same vehicle
  fixture.db.reservations.push({
    id: randomUUID(),
    requesterId: employeeId,
    departmentId,
    requestedCategoryId: vehicleCategoryId,
    resourceId: vehicleVanLargeId,
    driverId: activeDriver2Id,
    startTime: new Date(new Date(res.startTime).getTime() + 30 * 60 * 1000), // starts 30m after
    endTime: new Date(new Date(res.endTime).getTime() + 60 * 60 * 1000),
    status: "CONFIRMED",
    purpose: "VIP transport",
  });

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    },
    (err) => {
      assert.match(err.message, /vehicle is already reserved/i);
      assert.equal(err.field, "resourceId");
      return true;
    },
  );
});

test("7. Rejects allocation when driver has overlapping confirmed reservation", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  const res = fixture.db.reservations.find((r) => r.id === resId);

  // Create an overlapping confirmed reservation with the same driver
  fixture.db.reservations.push({
    id: randomUUID(),
    requesterId: employeeId,
    departmentId,
    requestedCategoryId: vehicleCategoryId,
    resourceId: vehicleCarSmallId,
    driverId: activeDriver1Id, // same driver!
    startTime: new Date(new Date(res.startTime).getTime() + 15 * 60 * 1000),
    endTime: new Date(new Date(res.endTime).getTime() - 15 * 60 * 1000),
    status: "CONFIRMED",
    purpose: "Urgent dispatch",
  });

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    },
    (err) => {
      assert.match(err.message, /driver is already assigned/i);
      assert.equal(err.field, "driverId");
      return true;
    },
  );
});

test("8. Exclusion constraint simulation: simultaneous allocations on vehicle caught cleanly", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);

  // Inject conflict into DB before execution
  const res = fixture.db.reservations.find((r) => r.id === resId);
  fixture.db.reservations.push({
    id: randomUUID(),
    requesterId: employeeId,
    departmentId,
    requestedCategoryId: vehicleCategoryId,
    resourceId: vehicleVanLargeId,
    driverId: activeDriver2Id,
    startTime: res.startTime,
    endTime: res.endTime,
    status: "CONFIRMED",
    purpose: "Race winner",
  });

  try {
    await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    assert.fail("Should have rejected");
  } catch (err) {
    assert.match(err.message, /already reserved during the requested time/i);
    assert.equal(err.field, "resourceId");
  }
});

test("9. Exclusion constraint simulation: simultaneous allocations on driver caught cleanly", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  const res = fixture.db.reservations.find((r) => r.id === resId);
  fixture.db.reservations.push({
    id: randomUUID(),
    requesterId: employeeId,
    departmentId,
    requestedCategoryId: vehicleCategoryId,
    resourceId: vehicleCarSmallId,
    driverId: activeDriver1Id,
    startTime: res.startTime,
    endTime: res.endTime,
    status: "CONFIRMED",
    purpose: "Race winner driver",
  });

  fixture.setActor(adminId);
  try {
    await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    assert.fail("Should have rejected");
  } catch (err) {
    assert.match(err.message, /driver is already assigned/i);
    assert.equal(err.field, "driverId");
  }
});

test("10. Atomic transaction rollback: failure leaves reservation APPROVED and unallocated", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);
  // Attempt invalid allocation with inactive driver
  await assert.rejects(async () => {
    await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, inactiveDriverId);
  });

  const reservation = fixture.db.reservations.find((r) => r.id === resId);
  assert.equal(reservation.status, "APPROVED");
  assert.equal(reservation.resourceId, null);
  assert.equal(reservation.driverId, null);

  const confirmation = fixture.db.approvals.find(
    (a) => a.reservationId === resId && a.stage === "ADMIN_CONFIRMATION",
  );
  assert.equal(confirmation, undefined);
});

test("11. Repeated confirmation rejected", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  fixture.setActor(adminId);
  await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);

  // Second confirmation attempt
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    },
    /Only approved reservation requests can receive vehicle and driver allocation/,
  );
});

test("12. Rejects allocation when prerequisite approvals are missing", async () => {
  const fixture = createAllocationFixture();
  const futureDate = getFutureDate(3);

  // Create PENDING request without forward/approve
  fixture.setActor(employeeId);
  const { reservationId } = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "13:00",
    destination: "Jaffna Office",
    purpose: "Regional survey",
    passengerCount: 2,
  });

  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(reservationId, vehicleCarSmallId, activeDriver1Id);
    },
    /Only approved reservation requests can receive vehicle and driver allocation/,
  );
});

test("13. Unauthorized Employee or HOD cannot allocate vehicles", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 4);

  // Employee attempt
  fixture.setActor(employeeId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    },
    (err) => err.status === 403 || err.message === "FORBIDDEN",
  );

  // HOD attempt
  fixture.setActor(hodId);
  await assert.rejects(
    async () => {
      await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleVanLargeId, activeDriver1Id);
    },
    (err) => err.status === 403 || err.message === "FORBIDDEN",
  );
});

test("14. Final confirmation audit record created with exact admin approverId", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 2);

  fixture.setActor(adminId);
  await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleCarSmallId, activeDriver2Id);

  const audit = fixture.db.approvals.find(
    (a) => a.reservationId === resId && a.stage === "ADMIN_CONFIRMATION",
  );
  assert.ok(audit);
  assert.equal(audit.stage, "ADMIN_CONFIRMATION");
  assert.equal(audit.decision, "APPROVED");
  assert.equal(audit.approverId, adminId);
});

test("15. Standard room direct booking and approval flow still functions without regression", async () => {
  const fixture = createAllocationFixture();
  const futureDate = getFutureDate(4);

  // Direct room booking
  fixture.setActor(employeeId);
  const direct = await fixture.service.createDirectReservation({
    resourceId: standardRoomId,
    date: futureDate,
    startTime: "14:00",
    endTime: "15:00",
    purpose: "Weekly Team Sync",
  });
  assert.ok(direct.reservationId);
  const directBooking = fixture.db.reservations.find((r) => r.id === direct.reservationId);
  assert.equal(directBooking.status, "CONFIRMED");

  // Approval room booking
  const req = await fixture.service.createReservationRequest({
    resourceId: approvalRoomId,
    date: futureDate,
    startTime: "10:00",
    endTime: "11:30",
    purpose: "Board meeting",
  });
  assert.ok(req.reservationId);
  const reqBooking = fixture.db.reservations.find((r) => r.id === req.reservationId);
  assert.equal(reqBooking.status, "PENDING");

  // Admin forward
  fixture.setActor(adminId);
  await fixture.service.adminForwardToHod(reqBooking.id);

  // HOD approve
  fixture.setActor(hodId);
  await fixture.service.hodApproveRequest(reqBooking.id);

  // Admin final confirm
  fixture.setActor(adminId);
  await fixture.service.adminFinalConfirm(reqBooking.id);

  const confirmed = fixture.db.reservations.find((r) => r.id === reqBooking.id);
  assert.equal(confirmed.status, "CONFIRMED");
});

test("16. Employee visibility: assigned vehicle and driver visible in listMyReservations", async () => {
  const fixture = createAllocationFixture();
  const resId = await createApprovedVehicleReservation(fixture, 3);

  fixture.setActor(adminId);
  await fixture.service.adminAllocateVehicleAndConfirm(resId, vehicleCarSmallId, activeDriver1Id);

  // Employee views reservations
  fixture.setActor(employeeId);
  const list = await fixture.service.listMyReservations({ tab: "upcoming", page: 1 });
  const item = list.reservations.find((r) => r.id === resId);

  assert.ok(item);
  assert.equal(item.status, "CONFIRMED");
  assert.equal(item.resource.id, vehicleCarSmallId);
  assert.equal(item.resource.resourceCode, "CAR_01");
  assert.ok(item.driver);
  assert.equal(item.driver.id, activeDriver1Id);
  assert.equal(item.driver.name, "Sunil Silva");
  assert.equal(item.driver.driverIdentifier, "DRV-001");
  assert.equal(item.destination, "Kandy Regional Centre");
  assert.equal(item.passengerCount, 3);
});
