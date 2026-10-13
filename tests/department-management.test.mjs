import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { loadSource } from "./helpers/source.mjs";

const enums = loadSource("src/generated/prisma/enums.ts", {});
const departmentValidation = loadSource("src/lib/department-validation.ts", {});
const reservationValidation = loadSource("src/lib/reservation-validation.ts", {
  "@/generated/prisma/enums": enums,
  "@/lib/reservation-types": {},
});

const adminId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const hod1Id = "33333333-3333-4333-8333-333333333333";
const hod2Id = "44444444-4444-4444-8444-444444444444";
const inactiveHodId = "55555555-5555-4555-8555-555555555555";

const dept1Id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const dept2Id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const resourceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const categoryId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createDepartmentFixture(options = {}) {
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
        departmentId: dept1Id,
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
        departmentId: dept1Id,
      },
      {
        id: hod1Id,
        employeeId: "HOD001",
        name: "Charlie Head",
        email: "charlie@example.com",
        role: "DEPARTMENT_HEAD",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: dept1Id,
      },
      {
        id: hod2Id,
        employeeId: "HOD002",
        name: "Diana OtherHead",
        email: "diana@example.com",
        role: "DEPARTMENT_HEAD",
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: dept2Id,
      },
      {
        id: inactiveHodId,
        employeeId: "HOD003",
        name: "Edward Inactive",
        email: "edward@example.com",
        role: "DEPARTMENT_HEAD",
        accountStatus: "INACTIVE",
        mustChangePassword: false,
        sessionVersion: 0,
        departmentId: dept1Id,
      },
    ],
    departments: [
      {
        id: dept1Id,
        name: "Engineering",
        code: "ENG",
        description: "Core engineering department",
        headId: hod1Id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: dept2Id,
        name: "Marketing",
        code: "MKT",
        description: "Marketing and sales",
        headId: hod2Id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    categories: [
      {
        id: categoryId,
        name: "Training Rooms",
        code: "TRAIN",
        isVehicle: false,
      },
    ],
    resources: [
      {
        id: resourceId,
        name: "Training Auditorium",
        resourceCode: "AUD_01",
        categoryId,
        isActive: true,
        requiresApproval: true,
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
      if (key === "head") {
        res.head = selectRow(database.users.find((u) => u.id === row.headId), value.select, database);
      } else if (key === "employees") {
        const emps = database.users.filter((u) => u.departmentId === row.id);
        res.employees = emps.map((e) => selectRow(e, value.select, database));
      } else if (key === "_count") {
        res._count = {
          employees: database.users.filter((u) => u.departmentId === row.id).length,
          reservations: database.reservations.filter((r) => r.departmentId === row.id).length,
        };
      } else if (key === "department") {
        res.department = selectRow(database.departments.find((d) => d.id === row.departmentId), value.select, database);
      } else if (key === "requester") {
        res.requester = selectRow(database.users.find((u) => u.id === row.requesterId), value.select, database);
      } else if (key === "requestedCategory") {
        res.requestedCategory = selectRow(database.categories.find((c) => c.id === row.requestedCategoryId), value.select, database);
      } else if (key === "resource") {
        res.resource = selectRow(database.resources.find((r) => r.id === row.resourceId), value.select, database);
      } else if (key === "approvals") {
        const apps = database.approvals.filter((a) => a.reservationId === row.id);
        res.approvals = apps.map((a) => selectRow(a, value.include, database, true));
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
        if (value.equals !== undefined) {
          const rowVal = String(row[key] ?? "");
          const target = String(value.equals ?? "");
          if (value.mode === "insensitive") {
            return rowVal.toLowerCase() === target.toLowerCase();
          }
          return rowVal === target;
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
        headId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      db[table].push(row);
      return selectRow(row, fields, db);
    },
    update: async ({ where, data }) => {
      const row = db[table].find((r) => matches(r, where));
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
        const err = new Error("FORBIDDEN");
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

  const deptService = loadSource("src/lib/department-service.ts", {
    "@/generated/prisma/client": enums,
    "@/lib/prisma": { prisma: prismaMock },
    "@/lib/authorization": authHelper,
    "@/lib/rate-limit": rateLimitHelper,
    "@/lib/department-validation": departmentValidation,
    "@/lib/department-types": {},
  });

  const reservationService = loadSource("src/lib/reservation-service.ts", {
    "@/generated/prisma/client": enums,
    "@/generated/prisma/enums": enums,
    "@/lib/prisma": { prisma: prismaMock },
    "@/lib/authorization": authHelper,
    "@/lib/rate-limit": rateLimitHelper,
    "@/lib/reservation-validation": reservationValidation,
    "@/lib/reservation-types": {},
  });

  return {
    db,
    deptService,
    reservationService,
    setActor: (id) => { currentActorId = id; },
    getDepartments: () => db.departments,
    getUsers: () => db.users,
  };
}

// =========================================================================
// TEST SUITE: DEPARTMENT MANAGEMENT AND HOD ASSIGNMENT
// =========================================================================

test("1. createDepartment creates a department with uppercase code and name", async () => {
  const fixture = createDepartmentFixture();

  const result = await fixture.deptService.createDepartment({
    name: "Finance & Accounting",
    code: "fin",
    description: "Financial management",
  });

  assert.ok(result.departmentId);
  const created = fixture.getDepartments().find((d) => d.id === result.departmentId);
  assert.ok(created);
  assert.equal(created.name, "Finance & Accounting");
  assert.equal(created.code, "FIN");
  assert.equal(created.description, "Financial management");
  assert.equal(created.headId, null);
});

test("2. createDepartment rejects duplicate department code and name", async () => {
  const fixture = createDepartmentFixture();

  // Duplicate code (case-insensitive)
  await assert.rejects(
    fixture.deptService.createDepartment({
      name: "New Engineering",
      code: "eng",
    }),
    /already exists/i,
  );

  // Duplicate name (case-insensitive)
  await assert.rejects(
    fixture.deptService.createDepartment({
      name: "engineering",
      code: "ENG2",
    }),
    /already exists/i,
  );
});

test("3. updateDepartment edits name, code, and description with collision checks", async () => {
  const fixture = createDepartmentFixture();

  // Valid edit
  await fixture.deptService.updateDepartment({
    id: dept1Id,
    name: "Engineering Division",
    code: "ENG_DIV",
    description: "Expanded engineering team",
  });

  const updated = fixture.getDepartments().find((d) => d.id === dept1Id);
  assert.equal(updated.name, "Engineering Division");
  assert.equal(updated.code, "ENG_DIV");

  // Collision with another department's code
  await assert.rejects(
    fixture.deptService.updateDepartment({
      id: dept1Id,
      name: "Engineering Division",
      code: "MKT", // dept2 has code MKT
    }),
    /already exists/i,
  );
});

test("4. Unauthorized department creation denial (non-Admin)", async () => {
  const fixture = createDepartmentFixture({ currentActorId: employeeId });

  await assert.rejects(
    fixture.deptService.createDepartment({
      name: "Security",
      code: "SEC",
    }),
    /FORBIDDEN/i,
  );
});

test("5. Employee creation dropdown loads all departments dynamically", async () => {
  const fixture = createDepartmentFixture();

  // Initially 2 departments
  let depts = await fixture.deptService.listDepartments();
  assert.equal(depts.length, 2);

  // Add 3rd department
  await fixture.deptService.createDepartment({
    name: "Operations",
    code: "OPS",
  });

  depts = await fixture.deptService.listDepartments();
  assert.equal(depts.length, 3);
  assert.ok(depts.some((d) => d.code === "OPS"));
});

test("6. transferEmployee transfers employee between departments", async () => {
  const fixture = createDepartmentFixture();

  // Bob is currently in dept1 (Engineering)
  assert.equal(fixture.getUsers().find((u) => u.id === employeeId).departmentId, dept1Id);

  await fixture.deptService.transferEmployee({
    userId: employeeId,
    targetDepartmentId: dept2Id, // Marketing
  });

  const transferred = fixture.getUsers().find((u) => u.id === employeeId);
  assert.equal(transferred.departmentId, dept2Id);
  assert.equal(transferred.role, "EMPLOYEE");
});

test("7. Reservation department snapshot preservation when employee transfers", async () => {
  const resId = "17171717-1111-4111-8111-111111111111";
  const now = new Date();

  const fixture = createDepartmentFixture({
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId: dept1Id, // Snapshot recorded as Engineering (dept1)
        requestedCategoryId: categoryId,
        resourceId,
        status: "PENDING",
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
        purpose: "Project sprint retrospective",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // Transfer Bob to dept2 (Marketing)
  await fixture.deptService.transferEmployee({
    userId: employeeId,
    targetDepartmentId: dept2Id,
  });

  // Verify employee is in dept2
  assert.equal(fixture.getUsers().find((u) => u.id === employeeId).departmentId, dept2Id);

  // Verify historical reservation STILL points to original snapshot dept1Id!
  const res = fixture.db.reservations.find((r) => r.id === resId);
  assert.equal(res.departmentId, dept1Id);
});

test("8. designateDepartmentHead assigns a valid HOD belonging to the department", async () => {
  const fixture = createDepartmentFixture();

  // Clear head first
  await fixture.deptService.designateDepartmentHead(dept1Id, null);
  assert.equal(fixture.getDepartments().find((d) => d.id === dept1Id).headId, null);

  // Assign Charlie (HOD001, active, in dept1)
  await fixture.deptService.designateDepartmentHead(dept1Id, hod1Id);
  assert.equal(fixture.getDepartments().find((d) => d.id === dept1Id).headId, hod1Id);
});

test("9. designateDepartmentHead rejects HOD from another department", async () => {
  const fixture = createDepartmentFixture();

  // Diana (hod2Id) belongs to dept2 (Marketing), cannot head dept1 (Engineering)
  await assert.rejects(
    fixture.deptService.designateDepartmentHead(dept1Id, hod2Id),
    /must belong to this department/i,
  );
});

test("10. designateDepartmentHead rejects inactive or non-HOD user", async () => {
  const fixture = createDepartmentFixture();

  // Inactive user
  await assert.rejects(
    fixture.deptService.designateDepartmentHead(dept1Id, inactiveHodId),
    /inactive/i,
  );

  // Non-HOD user (Bob is EMPLOYEE)
  await assert.rejects(
    fixture.deptService.designateDepartmentHead(dept1Id, employeeId),
    /only users with the department head role/i,
  );
});

test("11. Replacing an existing HOD updates department.headId consistently", async () => {
  const fixture = createDepartmentFixture();

  // Create another HOD in dept1
  const newHodId = "66666666-6666-4666-8666-666666666666";
  fixture.db.users.push({
    id: newHodId,
    employeeId: "HOD004",
    name: "Frank NewHead",
    email: "frank@example.com",
    role: "DEPARTMENT_HEAD",
    accountStatus: "ACTIVE",
    mustChangePassword: false,
    sessionVersion: 0,
    departmentId: dept1Id,
  });

  // Current head is Charlie (hod1Id). Replace with Frank (newHodId)
  await fixture.deptService.designateDepartmentHead(dept1Id, newHodId);

  const dept = fixture.getDepartments().find((d) => d.id === dept1Id);
  assert.equal(dept.headId, newHodId);
});

test("12. Revoking old HOD approval authority immediately upon replacement", async () => {
  const resId = "12121212-2222-4222-8222-222222222222";
  const now = new Date();

  // Create another HOD in dept1
  const newHodId = "66666666-6666-4666-8666-666666666666";

  const fixture = createDepartmentFixture({
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId: dept1Id,
        requestedCategoryId: categoryId,
        resourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
        purpose: "Team Workshop",
        createdAt: now,
        updatedAt: now,
      },
    ],
    approvals: [
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: adminId,
        stage: "ADMIN_REVIEW",
        decision: "APPROVED",
        decidedAt: now,
      },
    ],
  });

  fixture.db.users.push({
    id: newHodId,
    employeeId: "HOD004",
    name: "Frank NewHead",
    email: "frank@example.com",
    role: "DEPARTMENT_HEAD",
    accountStatus: "ACTIVE",
    mustChangePassword: false,
    sessionVersion: 0,
    departmentId: dept1Id,
  });

  // Replace Charlie (hod1Id) with Frank (newHodId)
  await fixture.deptService.designateDepartmentHead(dept1Id, newHodId);

  // Charlie tries to approve: Charlie is NO LONGER Department Head of dept1, so it must throw FORBIDDEN!
  fixture.setActor(hod1Id);
  await assert.rejects(
    fixture.reservationService.hodApproveRequest(resId),
    /FORBIDDEN/i,
  );
});

test("13. Authorizing newly designated HOD to decide outstanding departmental requests", async () => {
  const resId = "13131313-2222-4222-8222-222222222222";
  const now = new Date();
  const newHodId = "66666666-6666-4666-8666-666666666666";

  const fixture = createDepartmentFixture({
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId: dept1Id,
        requestedCategoryId: categoryId,
        resourceId,
        status: "AWAITING_APPROVAL",
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
        purpose: "Team Workshop",
        createdAt: now,
        updatedAt: now,
      },
    ],
    approvals: [
      {
        id: randomUUID(),
        reservationId: resId,
        approverId: adminId,
        stage: "ADMIN_REVIEW",
        decision: "APPROVED",
        decidedAt: now,
      },
    ],
  });

  fixture.db.users.push({
    id: newHodId,
    employeeId: "HOD004",
    name: "Frank NewHead",
    email: "frank@example.com",
    role: "DEPARTMENT_HEAD",
    accountStatus: "ACTIVE",
    mustChangePassword: false,
    sessionVersion: 0,
    departmentId: dept1Id,
  });

  // Replace Charlie with Frank
  await fixture.deptService.designateDepartmentHead(dept1Id, newHodId);

  // Frank (newly designated HOD) approves the request successfully
  fixture.setActor(newHodId);
  const result = await fixture.reservationService.hodApproveRequest(resId);
  assert.equal(result.id, resId);

  const res = fixture.db.reservations.find((r) => r.id === resId);
  assert.equal(res.status, "APPROVED");
});

test("14. Department with no HOD blocks Admin from forwarding requests", async () => {
  const resId = "14141414-3333-4333-8333-333333333333";
  const now = new Date();

  const fixture = createDepartmentFixture({
    reservations: [
      {
        id: resId,
        requesterId: employeeId,
        departmentId: dept1Id,
        requestedCategoryId: categoryId,
        resourceId,
        status: "PENDING",
        startTime: new Date(now.getTime() + 3600_000),
        endTime: new Date(now.getTime() + 7200_000),
        purpose: "Team sync",
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // Unassign head from dept1
  await fixture.deptService.designateDepartmentHead(dept1Id, null);

  // Admin tries to forward request
  fixture.setActor(adminId);
  await assert.rejects(
    fixture.reservationService.adminForwardToHod(resId),
    /does not have an active department head assigned/i,
  );
});

test("15. Transferring a designated HOD vacates their head assignment to prevent stale assignments", async () => {
  const fixture = createDepartmentFixture();

  // Charlie (hod1Id) is head of dept1
  assert.equal(fixture.getDepartments().find((d) => d.id === dept1Id).headId, hod1Id);

  // Transfer Charlie to dept2 (Marketing)
  await fixture.deptService.transferEmployee({
    userId: hod1Id,
    targetDepartmentId: dept2Id,
  });

  // Verify Charlie is now in dept2
  assert.equal(fixture.getUsers().find((u) => u.id === hod1Id).departmentId, dept2Id);

  // Verify dept1 headId has been VACATED (set to null), avoiding stale cross-department assignment!
  assert.equal(fixture.getDepartments().find((d) => d.id === dept1Id).headId, null);
});

test("16. Prevent single user from heading multiple departments simultaneously", async () => {
  const fixture = createDepartmentFixture();

  // Create a 3rd department
  const result = await fixture.deptService.createDepartment({
    name: "Customer Support",
    code: "SUP",
  });

  // Try to designate Charlie (who already heads dept1) as head of dept3
  await assert.rejects(
    fixture.deptService.designateDepartmentHead(result.departmentId, hod1Id),
    /must belong to this department/i,
  );
});

test("17. promoteAndDesignateHead promotes an employee to HOD and designates in single transaction", async () => {
  const fixture = createDepartmentFixture();

  // Bob is EMPLOYEE in dept1
  assert.equal(fixture.getUsers().find((u) => u.id === employeeId).role, "EMPLOYEE");

  await fixture.deptService.promoteAndDesignateHead(dept1Id, employeeId);

  // Bob is now DEPARTMENT_HEAD
  assert.equal(fixture.getUsers().find((u) => u.id === employeeId).role, "DEPARTMENT_HEAD");

  // Dept1's head is now Bob
  assert.equal(fixture.getDepartments().find((d) => d.id === dept1Id).headId, employeeId);
});

test("18. getDepartment returns detailed membership and head information", async () => {
  const fixture = createDepartmentFixture();

  const dept = await fixture.deptService.getDepartment(dept1Id);
  assert.ok(dept);
  assert.equal(dept.name, "Engineering");
  assert.equal(dept.code, "ENG");
  assert.equal(dept.head?.id, hod1Id);
  assert.ok(dept.members.length >= 3);
  assert.ok(dept.members.some((m) => m.id === employeeId));
});
