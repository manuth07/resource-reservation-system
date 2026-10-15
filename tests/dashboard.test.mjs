import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./helpers/source.mjs";
import { resourceEnums } from "./helpers/resources.mjs";

const Link = ({ children, ...props }) => React.createElement("a", props, children);
const ui = loadSource("src/components/ui.tsx", { "react/jsx-runtime": jsxRuntime });

function createDashboardPage(user, prismaMock) {
  return loadSource("src/app/(protected)/dashboard/page.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/server": { connection: async () => {} },
    "@/lib/page-auth": { requirePageUser: async () => user },
    "@/lib/prisma": { prisma: prismaMock },
    "@/generated/prisma/enums": resourceEnums,
    "@/components/ui": ui,
    "@/components/navigation-link": { NavigationLink: Link },
    "@/components/page-loading": { PageLoading: () => null },
    "@/lib/reservation-validation": {
      formatColomboDate: () => "Thursday, Oct 16, 2026",
      formatColomboTime: () => "10:00 AM",
    },
  });
}

test("Admin dashboard renders live database counts and omits outdated placeholder messaging", async () => {
  const adminUser = { id: "admin-1", role: "ADMIN" };
  const prismaMock = {
    reservation: {
      count: async ({ where }) => {
        if (where?.status === "PENDING") return 3;
        if (where?.status === "APPROVED") return 2;
        if (where?.status === "CONFIRMED") return 5;
        return 0;
      },
      findMany: async () => [
        {
          id: "res-1",
          status: "APPROVED",
          startTime: new Date("2026-10-16T10:00:00Z"),
          endTime: new Date("2026-10-16T12:00:00Z"),
          purpose: "Field audit inspection",
          resourceId: null,
          requestedCategory: { id: "cat-van", name: "Passenger Van", isVehicle: true },
          requester: { id: "u-1", name: "Alice Smith", employeeId: "EMP001" },
          department: { id: "dept-1", name: "Engineering", code: "ENG" },
          resource: null,
        },
      ],
    },
    resource: {
      count: async () => 14,
    },
    driver: {
      count: async () => 4,
    },
  };

  const { default: DashboardPage } = createDashboardPage(adminUser, prismaMock);
  const boundary = DashboardPage();
  const html = renderToStaticMarkup(await boundary.props.children.type());

  assert.match(html, /Administrative dashboard/);
  assert.match(html, /3/); // pending review
  assert.match(html, /2/); // ready to confirm
  assert.match(html, /5/); // upcoming confirmed
  assert.match(html, /14/); // active resources
  assert.match(html, /4 active drivers on roster/);
  assert.match(html, /Allocate/); // vehicle allocation button
  assert.doesNotMatch(html, /Reservation booking is not yet available/);
});

test("Department Head dashboard scopes approval metrics strictly to authorized departments", async () => {
  const hodUser = { id: "hod-1", role: "DEPARTMENT_HEAD" };
  const authorizedDeptId = "dept-finance";

  const prismaMock = {
    department: {
      findMany: async ({ where }) => {
        assert.equal(where.headId, "hod-1");
        return [{ id: authorizedDeptId, name: "Finance", code: "FIN" }];
      },
    },
    reservation: {
      count: async ({ where }) => {
        if (where?.departmentId?.in) {
          assert.deepEqual(where.departmentId.in, [authorizedDeptId]);
          return 2; // pending department approvals
        }
        if (where?.status === "CONFIRMED") return 1;
        return 0;
      },
      findMany: async ({ where }) => {
        assert.deepEqual(where.departmentId.in, [authorizedDeptId]);
        return [
          {
            id: "res-dept-1",
            status: "AWAITING_APPROVAL",
            startTime: new Date("2026-10-16T14:00:00Z"),
            endTime: new Date("2026-10-16T15:00:00Z"),
            purpose: "Quarterly budget review",
            resourceId: "room-1",
            requestedCategory: { id: "cat-room", name: "Conference Room", isVehicle: false },
            requester: { id: "emp-2", name: "Bob Jones", employeeId: "EMP002" },
            department: { id: authorizedDeptId, name: "Finance", code: "FIN" },
            resource: { id: "room-1", name: "Boardroom A", resourceCode: "ROOM-01" },
          },
        ];
      },
    },
  };

  const { default: DashboardPage } = createDashboardPage(hodUser, prismaMock);
  const boundary = DashboardPage();
  const html = renderToStaticMarkup(await boundary.props.children.type());

  assert.match(html, /Department Head dashboard/);
  assert.match(html, /Awaiting your approval/);
  assert.match(html, /2 requests require/);
  assert.match(html, /Decide/);
  assert.doesNotMatch(html, /Reservation booking and department approvals are not yet available/);
  assert.doesNotMatch(html, /Reservation booking is not yet available/);
});

test("Employee dashboard renders personal reservation metrics and upcoming spotlight", async () => {
  const empUser = { id: "emp-10", role: "EMPLOYEE" };

  const prismaMock = {
    reservation: {
      count: async ({ where }) => {
        assert.equal(where.requesterId, "emp-10");
        if (where.status === "CONFIRMED") return 1;
        return 2;
      },
      findFirst: async ({ where }) => {
        assert.equal(where.requesterId, "emp-10");
        assert.equal(where.status, "CONFIRMED");
        return {
          id: "res-next",
          startTime: new Date("2026-10-16T09:00:00Z"),
          endTime: new Date("2026-10-16T11:00:00Z"),
          destination: "Kandy Regional Office",
          requestedCategory: { id: "cat-car", name: "Executive Sedan", isVehicle: true },
          resource: { id: "veh-1", name: "Toyota Camry", resourceCode: "CAR-01", location: null },
          driver: { id: "drv-1", name: "Kamal Perera" },
        };
      },
      findMany: async ({ where }) => {
        assert.equal(where.requesterId, "emp-10");
        return [
          {
            id: "res-next",
            status: "CONFIRMED",
            startTime: new Date("2026-10-16T09:00:00Z"),
            endTime: new Date("2026-10-16T11:00:00Z"),
            purpose: "Client meeting",
            requestedCategory: { id: "cat-car", name: "Executive Sedan", isVehicle: true },
            resource: { id: "veh-1", name: "Toyota Camry", resourceCode: "CAR-01" },
            driver: { id: "drv-1", name: "Kamal Perera" },
          },
        ];
      },
    },
  };

  const { default: DashboardPage } = createDashboardPage(empUser, prismaMock);
  const boundary = DashboardPage();
  const html = renderToStaticMarkup(await boundary.props.children.type());

  assert.match(html, /Workspace dashboard/);
  assert.match(html, /Upcoming confirmed reservations/);
  assert.match(html, /Next scheduled reservation/);
  assert.match(html, /Toyota Camry/);
  assert.match(html, /Kamal Perera/);
  assert.doesNotMatch(html, /Reservation booking is not yet available/);
});
