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
const employee2Id = "22222222-2222-4222-8222-222222222222";
const adminId = "33333333-3333-4333-8333-333333333333";
const hodId = "44444444-4444-4444-8444-444444444444";
const departmentId = "55555555-5555-4555-8555-555555555555";

const standardCategoryId = "88888888-8888-4888-8888-888888888888";
const vehicleCategoryId = "99999999-9999-4999-8999-999999999999";

const standardRoomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const approvalRoomId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const vehicleResourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createVehicleTestFixture(options = {}) {
  const db = {
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
      },
      {
        id: employee2Id,
        employeeId: "EMP002",
        name: "Bob Builder",
        email: "bob@example.com",
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
        id: vehicleResourceId,
        name: "Toyota HiAce Van 1",
        resourceCode: "VAN_01",
        categoryId: vehicleCategoryId,
        capacity: 14,
        location: "Transport Bay",
        isActive: true,
        requiresApproval: true,
      },
    ],
    reservations: options.reservations ? [...options.reservations] : [],
    approvals: options.approvals ? [...options.approvals] : [],
  };

  let currentActorId = options.currentActorId ?? employeeId;

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
                isActive: r.isActive,
                requiresApproval: r.requiresApproval,
                isVehicle: cat ? cat.isVehicle : false,
              }];
            }
            if (rawSql.includes('FROM "public"."Reservation"')) {
              const resId = values[0];
              const r = db.reservations.find((res) => res.id === resId);
              if (!r) return [];
              return [{ ...r }];
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
        if (!u) throw new Error("Unauthorized");
        return { ...u };
      },
      requireRole: async (role) => {
        const u = db.users.find((user) => user.id === currentActorId);
        if (!u || u.role !== role) {
          const err = new Error("Forbidden");
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

// Helper to get a future date string (e.g. tomorrow)
function getFutureDate(daysAhead = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split("T")[0];
}

test("1. Valid vehicle request creates PENDING reservation with null resourceId/driverId and positive passenger count", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  const res = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "12:00",
    destination: "Colombo Port & Customs Office",
    purpose: "Official cargo inspection and customs clearance",
    passengerCount: 4,
  });

  assert.ok(res.reservationId);
  const created = fixture.db.reservations.find((r) => r.id === res.reservationId);
  assert.ok(created);
  assert.equal(created.status, "PENDING");
  assert.equal(created.requestedCategoryId, vehicleCategoryId);
  assert.equal(created.resourceId, null);
  assert.equal(created.driverId, null);
  assert.equal(created.passengerCount, 4);
  assert.equal(created.destination, "Colombo Port & Customs Office");
  assert.equal(created.purpose, "Official cargo inspection and customs clearance");
  assert.equal(created.requesterId, employeeId);
  assert.equal(created.departmentId, departmentId);
});

test("2. Non-vehicle category rejects vehicle transport request", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  await assert.rejects(
    async () => {
      await fixture.service.createVehicleReservationRequest({
        categoryId: standardCategoryId, // standard room category, isVehicle: false
        date: futureDate,
        startTime: "09:00",
        endTime: "12:00",
        destination: "Client Site",
        purpose: "Meeting",
        passengerCount: 2,
      });
    },
    (err) => {
      assert.match(err.message, /not a vehicle or transport category/i);
      assert.equal(err.field, "requestedCategoryId");
      return true;
    },
  );
});

test("3. Non-existent category ID rejects", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  await assert.rejects(
    async () => {
      await fixture.service.createVehicleReservationRequest({
        categoryId: "00000000-0000-4000-8000-000000000000",
        date: futureDate,
        startTime: "09:00",
        endTime: "12:00",
        destination: "Client Site",
        purpose: "Meeting",
        passengerCount: 2,
      });
    },
    (err) => {
      assert.match(err.message, /category does not exist/i);
      return true;
    },
  );
});

test("4. Forged resourceId, driverId, or status in client input are ignored and persisted as NULL and PENDING", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  // Even if extra parameters are maliciously injected
  const res = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "10:00",
    endTime: "14:00",
    destination: "Airport",
    purpose: "VIP guest pickup",
    passengerCount: 2,
    resourceId: vehicleResourceId,
    driverId: "some-driver-id",
    status: "CONFIRMED",
    requesterId: adminId,
    departmentId: "forged-dept",
  });

  const created = fixture.db.reservations.find((r) => r.id === res.reservationId);
  assert.equal(created.resourceId, null);
  assert.equal(created.driverId, null);
  assert.equal(created.status, "PENDING");
  assert.equal(created.requesterId, employeeId); // actual authenticated actor
  assert.equal(created.departmentId, departmentId); // actual department snapshot
});

test("5. Passenger count validation enforces positive integers and bounds", () => {
  const { parseVehicleRequestInput } = reservationValidation;
  const futureDate = getFutureDate(2);
  const base = {
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "11:00",
    destination: "Colombo 03",
    purpose: "Client meeting",
  };

  // Missing / empty
  assert.throws(
    () => parseVehicleRequestInput({ ...base, passengerCount: "" }),
    (err) => err.field === "passengerCount" && /required/i.test(err.message),
  );
  assert.throws(
    () => parseVehicleRequestInput({ ...base, passengerCount: undefined }),
    (err) => err.field === "passengerCount",
  );

  // Zero or negative
  assert.throws(
    () => parseVehicleRequestInput({ ...base, passengerCount: 0 }),
    (err) => err.field === "passengerCount" && /positive/i.test(err.message),
  );
  assert.throws(
    () => parseVehicleRequestInput({ ...base, passengerCount: -3 }),
    (err) => err.field === "passengerCount" && /positive/i.test(err.message),
  );

  // Non-integer float
  assert.throws(
    () => parseVehicleRequestInput({ ...base, passengerCount: 2.5 }),
    (err) => err.field === "passengerCount" && /positive/i.test(err.message),
  );

  // Exceeding vehicle limit
  assert.throws(
    () => parseVehicleRequestInput({ ...base, passengerCount: 201 }),
    (err) => err.field === "passengerCount" && /exceeds maximum/i.test(err.message),
  );

  // Valid positive integer
  const valid = parseVehicleRequestInput({ ...base, passengerCount: 5 });
  assert.equal(valid.passengerCount, 5);
});

test("6. Missing or whitespace-only destination rejects", () => {
  const { parseVehicleRequestInput } = reservationValidation;
  const futureDate = getFutureDate(2);
  const base = {
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "11:00",
    passengerCount: 3,
    purpose: "Site visit",
  };

  assert.throws(
    () => parseVehicleRequestInput({ ...base, destination: "" }),
    (err) => err.field === "destination" && /required/i.test(err.message),
  );
  assert.throws(
    () => parseVehicleRequestInput({ ...base, destination: "   " }),
    (err) => err.field === "destination" && /required/i.test(err.message),
  );
});

test("7. Past start time or invalid interval rejects", () => {
  const { parseVehicleRequestInput } = reservationValidation;
  const base = {
    categoryId: vehicleCategoryId,
    destination: "Client Office",
    passengerCount: 2,
    purpose: "Consulting",
  };

  // Past date
  assert.throws(
    () => parseVehicleRequestInput({ ...base, date: "2020-01-01", startTime: "09:00", endTime: "10:00" }),
    (err) => err.field === "startTime" && /past/i.test(err.message),
  );

  // End time before or equal to start time
  const futureDate = getFutureDate(2);
  assert.throws(
    () => parseVehicleRequestInput({ ...base, date: futureDate, startTime: "14:00", endTime: "13:00" }),
    (err) => err.field === "endTime" && /after start time/i.test(err.message),
  );
  assert.throws(
    () => parseVehicleRequestInput({ ...base, date: futureDate, startTime: "14:00", endTime: "14:00" }),
    (err) => err.field === "endTime" && /after start time/i.test(err.message),
  );
});

test("8. Correct requester and department association from authenticated session", async () => {
  const fixture = createVehicleTestFixture({ currentActorId: employee2Id });
  const futureDate = getFutureDate(3);

  const res = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "08:30",
    endTime: "11:30",
    destination: "Kandy Tech Park",
    purpose: "Branch visit",
    passengerCount: 3,
  });

  const created = fixture.db.reservations.find((r) => r.id === res.reservationId);
  assert.equal(created.requesterId, employee2Id);
  assert.equal(created.departmentId, departmentId);
});

test("9. Vehicle requests follow normal approval flow: PENDING -> AWAITING_APPROVAL -> APPROVED", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  // 1. Submit request as employee
  const { reservationId } = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "12:00",
    destination: "Client Headquarters",
    purpose: "Project handover session",
    passengerCount: 5,
  });

  let record = fixture.db.reservations.find((r) => r.id === reservationId);
  assert.equal(record.status, "PENDING");

  // 2. Admin forwards to HOD
  fixture.setActor(adminId);
  await fixture.service.adminForwardToHod(reservationId);
  record = fixture.db.reservations.find((r) => r.id === reservationId);
  assert.equal(record.status, "AWAITING_APPROVAL");

  const adminApproval = fixture.db.approvals.find(
    (a) => a.reservationId === reservationId && a.stage === "ADMIN_REVIEW",
  );
  assert.ok(adminApproval);
  assert.equal(adminApproval.decision, "APPROVED");

  // 3. Department Head approves request
  fixture.setActor(hodId);
  await fixture.service.hodApproveRequest(reservationId);
  record = fixture.db.reservations.find((r) => r.id === reservationId);
  assert.equal(record.status, "APPROVED");

  const hodApproval = fixture.db.approvals.find(
    (a) => a.reservationId === reservationId && a.stage === "DEPARTMENT_HEAD_APPROVAL",
  );
  assert.ok(hodApproval);
  assert.equal(hodApproval.decision, "APPROVED");
});

test("10. Admin final confirmation blocks vehicle requests with null resourceId", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  const { reservationId } = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "12:00",
    destination: "Ministry of Transportation",
    purpose: "Policy review meeting",
    passengerCount: 2,
  });

  // Advance to APPROVED
  fixture.setActor(adminId);
  await fixture.service.adminForwardToHod(reservationId);
  fixture.setActor(hodId);
  await fixture.service.hodApproveRequest(reservationId);

  // Attempt final confirmation as Admin
  fixture.setActor(adminId);
  await assert.rejects(
    async () => {
      await fixture.service.adminFinalConfirm(reservationId);
    },
    (err) => {
      assert.match(err.message, /vehicle and driver allocation before final confirmation/i);
      return true;
    },
  );

  // Status must remain APPROVED, not CONFIRMED
  const record = fixture.db.reservations.find((r) => r.id === reservationId);
  assert.equal(record.status, "APPROVED");
});

test("11. Multiple pending vehicle requests can overlap without conflict", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  // First request: 09:00 - 12:00
  const req1 = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "12:00",
    destination: "Destination A",
    purpose: "Purpose 1",
    passengerCount: 4,
  });

  // Second overlapping request: 10:00 - 13:00 (overlapping time)
  fixture.setActor(employee2Id);
  const req2 = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "10:00",
    endTime: "13:00",
    destination: "Destination B",
    purpose: "Purpose 2",
    passengerCount: 2,
  });

  assert.ok(req1.reservationId);
  assert.ok(req2.reservationId);
  assert.notEqual(req1.reservationId, req2.reservationId);

  const r1 = fixture.db.reservations.find((r) => r.id === req1.reservationId);
  const r2 = fixture.db.reservations.find((r) => r.id === req2.reservationId);
  assert.equal(r1.status, "PENDING");
  assert.equal(r2.status, "PENDING");
});

test("12. Direct booking and standard request endpoints refuse vehicle resources", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  // createDirectReservation with a vehicle resource
  await assert.rejects(
    async () => {
      await fixture.service.createDirectReservation({
        resourceId: vehicleResourceId,
        date: futureDate,
        startTime: "09:00",
        endTime: "11:00",
        purpose: "Testing direct booking of vehicle",
      });
    },
    (err) => {
      assert.match(err.message, /Vehicles cannot be booked directly/i);
      return true;
    },
  );

  // createReservationRequest with a vehicle resource
  await assert.rejects(
    async () => {
      await fixture.service.createReservationRequest({
        resourceId: vehicleResourceId,
        date: futureDate,
        startTime: "09:00",
        endTime: "11:00",
        purpose: "Testing request workflow for vehicle resource directly",
      });
    },
    (err) => {
      assert.match(err.message, /Vehicles cannot be requested through this workflow/i);
      return true;
    },
  );
});

test("13. Existing standard room direct booking and approval requests still work (regression check)", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(4);

  // Direct room booking
  const direct = await fixture.service.createDirectReservation({
    resourceId: standardRoomId,
    date: futureDate,
    startTime: "14:00",
    endTime: "15:00",
    purpose: "Team standup meeting",
  });

  const directBooking = fixture.db.reservations.find((r) => r.id === direct.reservationId);
  assert.ok(directBooking);
  assert.equal(directBooking.status, "CONFIRMED");
  assert.equal(directBooking.resourceId, standardRoomId);

  // Approval-required room request
  const request = await fixture.service.createReservationRequest({
    resourceId: approvalRoomId,
    date: futureDate,
    startTime: "16:00",
    endTime: "17:00",
    purpose: "Executive Board Session",
  });

  const reqBooking = fixture.db.reservations.find((r) => r.id === request.reservationId);
  assert.ok(reqBooking);
  assert.equal(reqBooking.status, "PENDING");
  assert.equal(reqBooking.resourceId, approvalRoomId);

  // Advance room request through approval to final confirmation
  fixture.setActor(adminId);
  await fixture.service.adminForwardToHod(reqBooking.id);
  fixture.setActor(hodId);
  await fixture.service.hodApproveRequest(reqBooking.id);
  fixture.setActor(adminId);
  await fixture.service.adminFinalConfirm(reqBooking.id);

  const confirmed = fixture.db.reservations.find((r) => r.id === reqBooking.id);
  assert.equal(confirmed.status, "CONFIRMED");
});

test("14. Employee visibility in My Reservations list", async () => {
  const fixture = createVehicleTestFixture();
  const futureDate = getFutureDate(2);

  const { reservationId } = await fixture.service.createVehicleReservationRequest({
    categoryId: vehicleCategoryId,
    date: futureDate,
    startTime: "09:00",
    endTime: "12:00",
    destination: "Southern Expressway Office",
    purpose: "Field audit",
    passengerCount: 3,
  });

  const list = await fixture.service.listMyReservations({ tab: "upcoming", page: 1 });
  assert.equal(list.reservations.length, 1);
  const item = list.reservations[0];
  assert.equal(item.id, reservationId);
  assert.equal(item.status, "PENDING");
  assert.equal(item.resource, null);
  assert.equal(item.requestedCategory.isVehicle, true);
  assert.equal(item.destination, "Southern Expressway Office");
  assert.equal(item.passengerCount, 3);
});
