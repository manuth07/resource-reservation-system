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
const otherHodId = "44444444-4444-4444-8444-444444444444";
const departmentId = "55555555-5555-4555-8555-555555555555";
const deptNoHeadId = "66666666-6666-4666-8666-666666666666";
const otherDeptId = "77777777-7777-4777-8777-777777777777";

const standardCategoryId = "88888888-8888-4888-8888-888888888888";
const vehicleCategoryId = "99999999-9999-4999-8999-999999999999";

const approvalResourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const directResourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const inactiveResourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const vehicleResourceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createApprovalTestFixture(options = {}) {
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
        ...options.actorOverrides?.employee,
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
        ...options.actorOverrides?.admin,
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
        ...options.actorOverrides?.hod,
      },
      {
        id: otherHodId,
        employeeId: "HOD002",
        name: "Oliver OtherHead",
        email: "oliver@example.com",
        role: "DEPARTMENT_HEAD",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: otherDeptId,
      },
    ],
    departments: [
      { id: departmentId, name: "Engineering", code: "ENG", headId: hodId },
      { id: deptNoHeadId, name: "Orphan Dept", code: "ORP", headId: null },
      { id: otherDeptId, name: "Marketing", code: "MKT", headId: otherHodId },
    ],
    categories: [
      { id: standardCategoryId, name: "Training Rooms", code: "TRAIN", isVehicle: false },
      { id: vehicleCategoryId, name: "Fleet Vehicles", code: "VEH", isVehicle: true },
    ],
    resources: [
      {
        id: approvalResourceId,
        name: "Training Auditorium",
        resourceCode: "AUD_01",
        categoryId: standardCategoryId,
        capacity: 50,
        location: "Main Building",
        isActive: true,
        requiresApproval: true,
      },
      {
        id: directResourceId,
        name: "Huddle Pod",
        resourceCode: "POD_01",
        categoryId: standardCategoryId,
        capacity: 4,
        location: "Floor 2",
        isActive: true,
        requiresApproval: false,
      },
      {
        id: inactiveResourceId,
        name: "Renovation Lab",
        resourceCode: "LAB_RENO",
        categoryId: standardCategoryId,
        capacity: 20,
        location: "Basement",
        isActive: false,
        requiresApproval: true,
      },
      {
        id: vehicleResourceId,
        name: "Van 1",
        resourceCode: "VAN_1",
        categoryId: vehicleCategoryId,
        capacity: 8,
        location: "Garage",
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
      return Promise.all(arg);
    },
  };

  const authHelper = {
    requireAuthenticatedUser: async () => {
      const u = db.users.find((user) => user.id === currentActorId);
      if (!u) {
        const err = new Error("UNAUTHENTICATED");
        err.code = "UNAUTHENTICATED";
        throw err;
      }
      if (u.accountStatus !== "ACTIVE") {
        const err = new Error("INACTIVE_ACCOUNT");
        err.code = "FORBIDDEN";
        throw err;
      }
      if (u.mustChangePassword) {
        const err = new Error("PASSWORD_CHANGE_REQUIRED");
        err.code = "PASSWORD_CHANGE_REQUIRED";
        throw err;
      }
      return u;
    },
    requireRole: async (...roles) => {
      const u = await authHelper.requireAuthenticatedUser();
      if (!roles.includes(u.role)) {
        const err = new Error("FORBIDDEN");
        err.code = "FORBIDDEN";
        throw err;
      }
      return u;
    },
    AuthorizationError: class AuthorizationError extends Error {
      constructor(code, status = 403) {
        super(code);
        this.code = code;
        this.status = status;
      }
    },
  };

  const rateLimitHelper = {
    enforceRateLimit: async () => {},
    RateLimitError: class RateLimitError extends Error {},
  };

  const service = loadSource("src/lib/reservation-service.ts", {
    "@/generated/prisma/client": reservationEnums,
    "@/generated/prisma/enums": reservationEnums,
    "@/lib/prisma": { prisma: prismaMock },
    "@/lib/authorization": authHelper,
    "@/lib/rate-limit": rateLimitHelper,
    "@/lib/reservation-validation": reservationValidation,
    "@/lib/reservation-types": {},
  });

  return {
    db,
    service,
    setActor: (id) => { currentActorId = id; },
    getReservations: () => db.reservations,
    getApprovals: () => db.approvals,
  };
}

// =========================================================================
// TEST SUITE: PHASE 2 RESERVATION APPROVAL WORKFLOW
// =========================================================================

test("1. createReservationRequest persists PENDING reservation without blocking slot", async () => {
  const fixture = createApprovalTestFixture({ currentActorId: employeeId });

  const input = {
    resourceId: approvalResourceId,
    date: "2026-11-20",
    startTime: "09:00",
    endTime: "11:00",
    purpose: "Team Quarterly Training Seminar",
  };

  const result = await fixture.service.createReservationRequest(input);
  assert.ok(result.reservationId);

  const res = fixture.getReservations().find((r) => r.id === result.reservationId);
  assert.ok(res);
  assert.equal(res.status, "PENDING");
  assert.equal(res.requesterId, employeeId);
  assert.equal(res.departmentId, departmentId);
  assert.equal(res.purpose, "Team Quarterly Training Seminar");

  // Verify NO approval records created yet
  const approvals = fixture.getApprovals().filter((a) => a.reservationId === res.id);
  assert.equal(approvals.length, 0);

  // Verify availability check: PENDING does not block direct availability
  const avail = await fixture.service.checkResourceAvailability(
    approvalResourceId,
    new Date("2026-11-20T03:30:00.000Z"),
    new Date("2026-11-20T05:30:00.000Z"),
  );
  assert.equal(avail.available, true);
});

test("2. createReservationRequest rejects direct-booking resources and inactive resources", async () => {
  const fixture = createApprovalTestFixture({ currentActorId: employeeId });

  // Direct resource
  await assert.rejects(
    fixture.service.createReservationRequest({
      resourceId: directResourceId,
      date: "2026-11-20",
      startTime: "09:00",
      endTime: "10:00",
      purpose: "Quick standup",
    }),
    /does not require approval/i,
  );

  // Inactive resource
  await assert.rejects(
    fixture.service.createReservationRequest({
      resourceId: inactiveResourceId,
      date: "2026-11-20",
      startTime: "09:00",
      endTime: "10:00",
      purpose: "Test purpose",
    }),
    /resource is inactive/i,
  );

  // Vehicle resource
  await assert.rejects(
    fixture.service.createReservationRequest({
      resourceId: vehicleResourceId,
      date: "2026-11-20",
      startTime: "09:00",
      endTime: "10:00",
      purpose: "Trip",
    }),
    /Vehicles cannot be requested/i,
  );
});

test("3. adminForwardToHod transitions PENDING to AWAITING_APPROVAL and records ADMIN_REVIEW", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const fixture = createApprovalTestFixture({
    currentActorId: adminId,
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "PENDING",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
    ],
  });

  const forwardResult = await fixture.service.adminForwardToHod(resId);
  assert.equal(forwardResult.id, resId);

  const res = fixture.getReservations().find((r) => r.id === resId);
  assert.equal(res.status, "AWAITING_APPROVAL");

  const approvals = fixture.getApprovals().filter((a) => a.reservationId === resId);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].stage, "ADMIN_REVIEW");
  assert.equal(approvals[0].decision, "APPROVED");
  assert.equal(approvals[0].approverId, adminId);
});

test("4. adminForwardToHod prevents non-admin users and validates department has active HOD", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const orphanResId = "87654321-4321-4321-8321-ba0987654321";

  const fixture = createApprovalTestFixture({
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "PENDING",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
      {
        id: orphanResId,
        requesterId: employeeId,
        departmentId: deptNoHeadId, // Department has headId: null
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "PENDING",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Orphan department request",
      },
    ],
  });

  // Non-admin attempt throws FORBIDDEN
  fixture.setActor(employeeId);
  await assert.rejects(
    fixture.service.adminForwardToHod(resId),
    /FORBIDDEN/i,
  );

  // Admin attempt on department missing active Department Head
  fixture.setActor(adminId);
  await assert.rejects(
    fixture.service.adminForwardToHod(orphanResId),
    /does not have an active Department Head assigned/i,
  );
});

test("5. adminRejectRequest transitions PENDING to REJECTED with valid reason", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const fixture = createApprovalTestFixture({
    currentActorId: adminId,
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "PENDING",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
    ],
  });

  // Empty reason rejected
  await assert.rejects(
    fixture.service.adminRejectRequest(resId, ""),
    /rejection reason is required/i,
  );

  // Overlong reason rejected
  await assert.rejects(
    fixture.service.adminRejectRequest(resId, "A".repeat(1001)),
    /must not exceed 1000 characters/i,
  );

  // Valid rejection
  await fixture.service.adminRejectRequest(resId, "The training room is closed for scheduled maintenance.");

  const res = fixture.getReservations().find((r) => r.id === resId);
  assert.equal(res.status, "REJECTED");

  const approvals = fixture.getApprovals().filter((a) => a.reservationId === resId);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].stage, "ADMIN_REVIEW");
  assert.equal(approvals[0].decision, "REJECTED");
  assert.equal(approvals[0].rejectionReason, "The training room is closed for scheduled maintenance.");
});

test("6. hodApproveRequest transitions AWAITING_APPROVAL to APPROVED and records DEPARTMENT_HEAD_APPROVAL", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const fixture = createApprovalTestFixture({
    currentActorId: hodId,
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
    ],
    approvals: [
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: adminId,
        stage: "ADMIN_REVIEW",
        decision: "APPROVED",
      },
    ],
  });

  const approveResult = await fixture.service.hodApproveRequest(resId);
  assert.equal(approveResult.id, resId);

  const res = fixture.getReservations().find((r) => r.id === resId);
  assert.equal(res.status, "APPROVED");

  const approvals = fixture.getApprovals().filter((a) => a.reservationId === resId);
  assert.equal(approvals.length, 2);
  const hodApp = approvals.find((a) => a.stage === "DEPARTMENT_HEAD_APPROVAL");
  assert.ok(hodApp);
  assert.equal(hodApp.decision, "APPROVED");
  assert.equal(hodApp.approverId, hodId);
});

test("7. hodApproveRequest enforces department boundary and blocks self-approval", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const hodSelfResId = "99998888-7777-4666-8555-444433332222";

  const fixture = createApprovalTestFixture({
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId, // Engineering department (headed by hodId)
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Employee request",
      },
      {
        id: hodSelfResId,
        requesterId: hodId, // Helen requested for her own department
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T06:30:00.000Z"),
        endTime: new Date("2026-11-20T08:30:00.000Z"),
        purpose: "HOD self request",
      },
    ],
  });

  // Cross-department attempt: otherHodId heads Marketing, cannot decide Engineering request
  fixture.setActor(otherHodId);
  await assert.rejects(
    fixture.service.hodApproveRequest(resId),
    /FORBIDDEN/i,
  );

  // Self-approval attempt: Helen tries to approve her own request
  fixture.setActor(hodId);
  await assert.rejects(
    fixture.service.hodApproveRequest(hodSelfResId),
    /cannot approve their own reservation requests/i,
  );

  // Self-rejection attempt is also blocked
  await assert.rejects(
    fixture.service.hodRejectRequest(hodSelfResId, "Self rejection"),
    /cannot decide their own reservation requests/i,
  );
});

test("8. hodRejectRequest transitions AWAITING_APPROVAL to REJECTED with valid reason", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const fixture = createApprovalTestFixture({
    currentActorId: hodId,
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
    ],
  });

  // Empty reason rejected
  await assert.rejects(
    fixture.service.hodRejectRequest(resId, ""),
    /rejection reason is required/i,
  );

  await fixture.service.hodRejectRequest(resId, "Budget not approved for external trainer attendance.");

  const res = fixture.getReservations().find((r) => r.id === resId);
  assert.equal(res.status, "REJECTED");

  const approvals = fixture.getApprovals().filter((a) => a.reservationId === resId);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].stage, "DEPARTMENT_HEAD_APPROVAL");
  assert.equal(approvals[0].decision, "REJECTED");
  assert.equal(approvals[0].rejectionReason, "Budget not approved for external trainer attendance.");
});

test("9. adminFinalConfirm transitions APPROVED to CONFIRMED when available", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const fixture = createApprovalTestFixture({
    currentActorId: adminId,
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "APPROVED",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
    ],
    approvals: [
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: adminId,
        stage: "ADMIN_REVIEW",
        decision: "APPROVED",
      },
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: hodId,
        stage: "DEPARTMENT_HEAD_APPROVAL",
        decision: "APPROVED",
      },
    ],
  });

  const confirmResult = await fixture.service.adminFinalConfirm(resId);
  assert.equal(confirmResult.id, resId);

  const res = fixture.getReservations().find((r) => r.id === resId);
  assert.equal(res.status, "CONFIRMED");

  const approvals = fixture.getApprovals().filter((a) => a.reservationId === resId);
  assert.equal(approvals.length, 3);
  const confirmApp = approvals.find((a) => a.stage === "ADMIN_CONFIRMATION");
  assert.ok(confirmApp);
  assert.equal(confirmApp.decision, "APPROVED");
  assert.equal(confirmApp.approverId, adminId);
});

test("10. adminFinalConfirm checks slot availability and keeps request APPROVED on conflict", async () => {
  const resId = "12345678-1234-4234-8234-1234567890ab";
  const conflictResId = "11111111-2222-3333-4444-555566667777";

  const fixture = createApprovalTestFixture({
    currentActorId: adminId,
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "APPROVED",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Training seminar",
      },
      {
        id: conflictResId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "CONFIRMED", // Confirmed slot overlapping!
        startTime: new Date("2026-11-20T04:00:00.000Z"),
        endTime: new Date("2026-11-20T05:00:00.000Z"),
        purpose: "Conflicting direct meeting",
      },
    ],
    approvals: [
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: adminId,
        stage: "ADMIN_REVIEW",
        decision: "APPROVED",
      },
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: hodId,
        stage: "DEPARTMENT_HEAD_APPROVAL",
        decision: "APPROVED",
      },
    ],
  });

  await assert.rejects(
    fixture.service.adminFinalConfirm(resId),
    /already reserved during the requested time interval.*remains approved/i,
  );

  // Reservation remains APPROVED
  const res = fixture.getReservations().find((r) => r.id === resId);
  assert.equal(res.status, "APPROVED");

  // No ADMIN_CONFIRMATION approval was persisted
  const approvals = fixture.getApprovals().filter((a) => a.reservationId === resId);
  assert.equal(approvals.length, 2);
});

test("11. cancelReservation allows employee to cancel PENDING, AWAITING_APPROVAL, and APPROVED requests", async () => {
  const pendingId = "11111111-aaaa-4111-8111-111111111111";
  const awaitingId = "22222222-bbbb-4222-8222-222222222222";
  const approvedId = "33333333-cccc-4333-8333-333333333333";
  const rejectedId = "44444444-dddd-4444-8444-444444444444";
  const now = new Date();

  const fixture = createApprovalTestFixture({
    currentActorId: employeeId,
    reservations: [
      {
        id: pendingId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "PENDING",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Pending req",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: awaitingId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T06:00:00.000Z"),
        endTime: new Date("2026-11-20T07:00:00.000Z"),
        purpose: "Awaiting req",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: approvedId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "APPROVED",
        startTime: new Date("2026-11-20T08:00:00.000Z"),
        endTime: new Date("2026-11-20T09:00:00.000Z"),
        purpose: "Approved req",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: rejectedId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "REJECTED",
        startTime: new Date("2026-11-20T10:00:00.000Z"),
        endTime: new Date("2026-11-20T11:00:00.000Z"),
        purpose: "Rejected req",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // Cancel PENDING
  await fixture.service.cancelReservation(pendingId);
  assert.equal(fixture.getReservations().find((r) => r.id === pendingId).status, "CANCELLED");

  // Cancel AWAITING_APPROVAL
  await fixture.service.cancelReservation(awaitingId);
  assert.equal(fixture.getReservations().find((r) => r.id === awaitingId).status, "CANCELLED");

  // Cancel APPROVED
  await fixture.service.cancelReservation(approvedId);
  assert.equal(fixture.getReservations().find((r) => r.id === approvedId).status, "CANCELLED");

  // Attempt to cancel REJECTED fails
  await assert.rejects(
    fixture.service.cancelReservation(rejectedId),
    /Rejected reservations cannot be cancelled/i,
  );
});

test("12. listAdminReservationRequests and listHodApprovalQueue correctly filter queues", async () => {
  const pId = "11111111-1111-4111-8111-111111111111";
  const awId = "22222222-2222-4222-8222-222222222222";
  const apId = "33333333-3333-4333-8333-333333333333";
  const otherAwId = "44444444-4444-4444-8444-444444444444";
  const now = new Date();

  const fixture = createApprovalTestFixture({
    reservations: [
      {
        id: pId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "PENDING",
        startTime: new Date("2026-11-20T03:30:00.000Z"),
        endTime: new Date("2026-11-20T05:30:00.000Z"),
        purpose: "Pending req",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: awId,
        requesterId: employeeId,
        departmentId, // Engineering
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T06:00:00.000Z"),
        endTime: new Date("2026-11-20T07:00:00.000Z"),
        purpose: "Awaiting req",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: apId,
        requesterId: employeeId,
        departmentId,
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "APPROVED",
        startTime: new Date("2026-11-20T08:00:00.000Z"),
        endTime: new Date("2026-11-20T09:00:00.000Z"),
        purpose: "Approved req",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherAwId,
        requesterId: employeeId,
        departmentId: otherDeptId, // Marketing department
        requestedCategoryId: standardCategoryId,
        resourceId: approvalResourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date("2026-11-20T09:00:00.000Z"),
        endTime: new Date("2026-11-20T10:00:00.000Z"),
        purpose: "Marketing awaiting req",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // Admin queue tests
  fixture.setActor(adminId);
  const pendingAdmin = await fixture.service.listAdminReservationRequests({ tab: "pending" });
  assert.equal(pendingAdmin.total, 1);
  assert.equal(pendingAdmin.reservations[0].id, pId);

  const awaitingAdmin = await fixture.service.listAdminReservationRequests({ tab: "awaiting_hod" });
  assert.equal(awaitingAdmin.total, 2);

  const approvedAdmin = await fixture.service.listAdminReservationRequests({ tab: "approved" });
  assert.equal(approvedAdmin.total, 1);
  assert.equal(approvedAdmin.reservations[0].id, apId);

  // HOD queue tests (Engineering HOD should only see Engineering awaiting requests)
  fixture.setActor(hodId);
  const hodPending = await fixture.service.listHodApprovalQueue({ tab: "pending" });
  assert.equal(hodPending.total, 1);
  assert.equal(hodPending.reservations[0].id, awId);
});
