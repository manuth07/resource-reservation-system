import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./helpers/source.mjs";
import { categoryId, resourceId, timestamp, resourceInput, categoryInput } from "./helpers/resources.mjs";

const ui = loadSource("src/components/ui.tsx", { "react/jsx-runtime": jsxRuntime });
const Link = ({ children, ...props }) => { const attributes = { ...props }; delete attributes.onNavigate; return React.createElement("a", attributes, children); };
function navigation(pathname) {
  return loadSource("src/components/workspace-navigation.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "next/navigation": { usePathname: () => pathname }, "@/components/navigation-link": { NavigationLink: Link } });
}

test("navigation separates Workspace and Administration and hides Admin links for ordinary employees/HOD", () => {
  for (const admin of [false, true]) {
    const { WorkspaceNavigation } = navigation("/admin/resource-categories/new");
    const html = renderToStaticMarkup(React.createElement(WorkspaceNavigation, { isAdmin: admin }));
    assert.match(html, /Workspace/); assert.match(html, /Resource catalog/);
    if (admin) {
      assert.match(html, /Resource management/);
      assert.match(html, /Organization/);
      assert.match(html, /Reservations/);
      assert.match(html, /href="\/admin\/resource-categories" aria-current="page"/);
    }
    else assert.doesNotMatch(html, /href="\/admin\//);
  }
  const { WorkspaceNavigation } = navigation("/resources/details");
  const mobile = renderToStaticMarkup(React.createElement(WorkspaceNavigation, { isAdmin: false, mobile: true }));
  assert.match(mobile, /<details class="mobile-navigation"/); assert.match(mobile, /<summary>Menu<\/summary>/);
  assert.match(mobile, /Mobile workspace navigation/); assert.match(mobile, /href="\/resources" aria-current="page"/);
});

test("mobile navigation closes on client navigation or Escape and returns focus to its summary", () => {
  const details = { open: true }; let focus = 0; let refs = 0;
  const { WorkspaceNavigation } = loadSource("src/components/workspace-navigation.tsx", {
    react: { useRef: () => ({ current: refs++ === 0 ? details : { focus() { focus++; } } }) },
    "react/jsx-runtime": jsxRuntime, "next/navigation": { usePathname: () => "/resources" }, "@/components/navigation-link": { NavigationLink: Link },
  });
  const tree = WorkspaceNavigation({ isAdmin: false, mobile: true });
  tree.props.onKeyDown({ key: "Escape" }); assert.equal(details.open, false); assert.equal(focus, 1);
  const nav = tree.props.children[1].props.children;
  const group = nav.props.children[0];
  const link = group.props.children[1].props.children[0].props.children;
  details.open = true; link.props.onNavigate(); assert.equal(details.open, false);
});

test("workspace shell retains skip target, account controls and server logout action", () => {
  const nav = navigation("/admin/resources"); const logout = async () => {};
  const { WorkspaceShell } = loadSource("src/components/workspace-shell.tsx", { "react/jsx-runtime": jsxRuntime, "@/components/ui": ui, "@/components/navigation-link": { NavigationLink: Link }, "@/components/workspace-navigation": nav });
  const html = renderToStaticMarkup(React.createElement(WorkspaceShell, { employeeId: "ADMIN001", roleLabel: "Administrator", isAdmin: true, logoutAction: logout }, "Protected content"));
  assert.match(html, /href="#workspace-main"/); assert.match(html, /id="workspace-main" tabindex="-1"/);
  assert.match(html, /workspace-sidebar/); assert.match(html, /workspace-topbar/); assert.match(html, /ADMIN001/);
  assert.match(html, /Change password/); assert.match(html, /Sign out/);
});

test("catalog integrates controls with one table panel, labels real filtered totals and omits Admin actions", async () => {
  const category = { id: categoryId, ...categoryInput };
  const record = { ...resourceInput, id: resourceId, category, capacity: 12, updatedAt: timestamp };
  const { ResourceList } = loadSource("src/components/resource-list.tsx", {
    "react/jsx-runtime": jsxRuntime, "@/components/ui": ui, "@/components/navigation-link": { NavigationLink: Link },
    "@/components/resource-status-control": { ResourceStatusControl: () => React.createElement("button", null, "Deactivate") },
    "@/lib/resource-service": { listCategoryOptions: async () => [category], listResources: async () => ({ resources: [record], total: 1, pages: 1, filters: { q: "room", categoryId: "", status: "ACTIVE", page: 1 } }) },
    "@/lib/resource-validation": { ResourceManagementError: class extends Error {} },
  });
  const html = renderToStaticMarkup(await ResourceList({ searchParams: {}, admin: false }));
  assert.equal((html.match(/class="panel /g) ?? []).length, 1);
  assert.match(html, /1 resource matching filters/); assert.match(html, /Explore resources/);
  assert.doesNotMatch(html, /Deactivate|>Actions<|\/admin\/resources/);
  assert.match(html, /not available for a particular date or time/);
});

test("category directory exposes real usage counts and classifications without changing protected rules", async () => {
  const { default: Page } = loadSource("src/app/(protected)/admin/resource-categories/page.tsx", {
    react: React, "react/jsx-runtime": jsxRuntime, "@/components/ui": ui, "@/components/navigation-link": { NavigationLink: Link },
    "next/server": { connection: async () => {} }, "@/generated/prisma/enums": { UserRole: { ADMIN: "ADMIN" } },
    "@/lib/page-auth": { requirePageUser: async (role) => { assert.equal(role, "ADMIN"); } },
    "@/components/page-loading": { PageLoading: () => null },
    "@/lib/resource-service": { listCategories: async () => [{ id: categoryId, ...categoryInput, resourceCount: 3, reservationCount: 2 }, { id: "vans", name: "Vans", code: "VAN", isVehicle: true, resourceCount: 0, reservationCount: 0 }] },
  });
  const boundary = Page({ searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(await boundary.props.children.type(boundary.props.children.props));
  assert.match(html, /2 categories/); assert.match(html, /Standard resource/); assert.match(html, /Vehicle \/ Transport/);
  assert.match(html, /Classification protected/); assert.match(html, />Resources<\/th>/); assert.match(html, />Requests<\/th>/);
});

test("WorkspaceSectionLabel accurately renders 3-level breadcrumbs for Admin requests and Employee reservations", () => {
  const { WorkspaceSectionLabel: AdminDetail } = navigation("/admin/reservations/res_123");
  const adminHtml = renderToStaticMarkup(React.createElement(AdminDetail));
  assert.match(adminHtml, /Administration/);
  assert.match(adminHtml, /Reservation requests/);
  assert.match(adminHtml, /Request details/);

  const { WorkspaceSectionLabel: EmployeeDetail } = navigation("/reservations/res_123");
  const employeeHtml = renderToStaticMarkup(React.createElement(EmployeeDetail));
  assert.match(employeeHtml, /Workspace/);
  assert.match(employeeHtml, /My reservations/);
  assert.match(employeeHtml, /Reservation details/);

  const { WorkspaceSectionLabel: AdminQueue } = navigation("/admin/reservations");
  const queueHtml = renderToStaticMarkup(React.createElement(AdminQueue));
  assert.match(queueHtml, /Administration/);
  assert.match(queueHtml, /Reservation requests/);
  assert.doesNotMatch(queueHtml, /Request details/);
});

test("ReservationCancelControl renders resource-specific copy preserving history", () => {
  const { ReservationCancelControl } = loadSource("src/components/reservation-cancel-control.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@/app/reservation-actions": { cancelReservationAction: async () => ({}) },
    "@/components/ui": ui,
    "@/components/confirmation-dialog": {
      ConfirmationDialog: ({ description }) => React.createElement("div", { "data-description": description }),
    },
  });

  const standardHtml = renderToStaticMarkup(React.createElement(ReservationCancelControl, { reservationId: "r1", isVehicle: false }));
  assert.match(standardHtml, /The reserved resource will immediately become available for other employees to book\. Cancelled reservations remain in your history\./);

  const vehicleHtml = renderToStaticMarkup(React.createElement(ReservationCancelControl, { reservationId: "r2", isVehicle: true }));
  assert.match(vehicleHtml, /The assigned vehicle and driver will be released immediately for other bookings\. Cancelled reservations remain in your history\./);
});

