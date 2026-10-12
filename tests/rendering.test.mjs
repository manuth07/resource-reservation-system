import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./helpers/source.mjs";
import { resourceEnums } from "./helpers/resources.mjs";

test("current-user reads deduplicate in a simulated render scope, with no cross-request or cross-user reuse", async () => {
  let scope = null;
  let userId = "one";
  let reads = 0;
  const users = {
    one: { id: "one", role: "ADMIN", accountStatus: "ACTIVE", mustChangePassword: false, sessionVersion: 0 },
    two: { id: "two", role: "EMPLOYEE", accountStatus: "ACTIVE", mustChangePassword: false, sessionVersion: 0 },
  };
  const simulatedCache = (fn) => {
    const key = Symbol();
    return (...args) => {
      if (!scope) return fn(...args);
      if (!scope.has(key)) scope.set(key, fn(...args));
      return scope.get(key);
    };
  };
  const authorization = loadSource("src/lib/authorization.ts", {
    react: { cache: simulatedCache },
    "@/auth": { auth: async () => ({ user: { id: userId, sessionVersion: 0 } }) },
    "@/generated/prisma/enums": resourceEnums,
    "@/lib/prisma": { prisma: { user: { findUnique: async ({ where }) => { reads++; return { ...users[where.id] }; } } } },
  });
  scope = new Map();
  const values = await Promise.all([authorization.requireRole("ADMIN"), authorization.requireAuthenticatedUser(), authorization.getAuthenticatedUser()]);
  assert.equal(reads, 1); assert.equal(values[0].id, "one");
  userId = "two"; scope = new Map();
  assert.equal((await authorization.getAuthenticatedUser()).id, "two");
  await assert.rejects(authorization.requireRole("ADMIN"), /FORBIDDEN/);
  assert.equal(reads, 2);
  users.two.sessionVersion = 1; scope = new Map();
  assert.equal(await authorization.getAuthenticatedUser(), null);
  users.two.sessionVersion = 0; users.two.accountStatus = "INACTIVE"; scope = new Map();
  assert.equal(await authorization.getAuthenticatedUser(), null);
});

test("real React cache outside a render still checks current database state on each operation", async () => {
  let reads = 0;
  let active = true;
  const authorization = loadSource("src/lib/authorization.ts", {
    react: React,
    "@/auth": { auth: async () => ({ user: { id: "fixture", sessionVersion: 0 } }) },
    "@/generated/prisma/enums": resourceEnums,
    "@/lib/prisma": { prisma: { user: { findUnique: async () => { reads++; return { id: "fixture", role: "ADMIN", accountStatus: active ? "ACTIVE" : "INACTIVE", mustChangePassword: false, sessionVersion: 0 }; } } } },
  });
  await authorization.requireRole("ADMIN");
  active = false;
  await assert.rejects(authorization.requireRole("ADMIN"), /UNAUTHENTICATED/);
  assert.equal(reads, 2);
});

test("every protected page and layout returns a local Suspense boundary before performing I/O", () => {
  const paths = [
    "src/app/(protected)/layout.tsx", "src/app/(protected)/dashboard/page.tsx", "src/app/(protected)/admin/employees/page.tsx",
    "src/app/(protected)/resources/page.tsx", "src/app/(protected)/resources/[id]/page.tsx",
    "src/app/(protected)/admin/resources/page.tsx", "src/app/(protected)/admin/resources/new/page.tsx", "src/app/(protected)/admin/resources/[id]/edit/page.tsx",
    "src/app/(protected)/admin/resource-categories/page.tsx", "src/app/(protected)/admin/resource-categories/new/page.tsx", "src/app/(protected)/admin/resource-categories/[id]/edit/page.tsx",
    "src/app/login/page.tsx", "src/app/change-password/page.tsx",
  ];
  const noIo = () => { throw new Error("I/O executed before Suspense"); };
  const component = () => null;
  const mocks = {
    react: React, "react/jsx-runtime": jsxRuntime,
    "next/server": { connection: noIo }, "next/navigation": { redirect: noIo, notFound: noIo },
    "@/lib/page-auth": { requirePageUser: noIo }, "@/lib/authorization": { getAuthenticatedUser: noIo },
    "@/lib/resource-service": { listCategoryOptions: noIo, listCategories: noIo, getCategory: noIo, getResourceForEdit: noIo, getResource: noIo },
    "@/lib/prisma": { prisma: {} }, "@/generated/prisma/enums": resourceEnums,
    "@/app/auth-actions": { logoutAction: noIo }, "@/components/navigation-link": { NavigationLink: component },
    "@/components/page-loading": { PageLoading: component, WorkspaceLoading: component, AccountLoading: component },
    "@/components/ui": { Card: component, PageHeader: component, StatusBadge: component, Button: component, DataTable: component, EmptyState: component },
    "@/components/resource-list": { ResourceList: component }, "@/components/resource-form": { ResourceForm: component },
    "@/components/category-form": { CategoryForm: component }, "@/components/workspace-navigation": { WorkspaceNavigation: component },
    "@/components/employee-management": { EmployeeManagement: component }, "@/components/auth-form": { AuthForm: component },
  };
  for (const path of paths) {
    const page = loadSource(path, mocks).default;
    const rendered = page({ params: Promise.resolve({ id: "fixture" }), searchParams: Promise.resolve({}), children: null });
    assert.equal(rendered.type, React.Suspense, path);
    assert.ok(rendered.props.fallback, path);
    assert.equal(typeof rendered.props.children.type, "function", path);
  }
});

test("resource list starts independent category and resource reads without waiting for the first result", async () => {
  let categoriesStarted = false; let resourcesStarted = false;
  let finishCategories; let finishResources;
  const categories = new Promise((resolve) => { finishCategories = resolve; });
  const resources = new Promise((resolve) => { finishResources = resolve; });
  const component = () => null;
  const { ResourceList } = loadSource("src/components/resource-list.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "@/components/navigation-link": { NavigationLink: component },
    "@/components/ui": { Card: component, DataTable: component, EmptyState: component, FormField: component, Input: component, StatusBadge: component, Button: component },
    "@/components/resource-status-control": { ResourceStatusControl: component },
    "@/lib/resource-service": { listCategoryOptions: () => { categoriesStarted = true; return categories; }, listResources: () => { resourcesStarted = true; return resources; } },
    "@/lib/resource-validation": { ResourceManagementError: class extends Error {} },
  });
  const pending = ResourceList({ searchParams: {}, admin: true });
  assert.equal(categoriesStarted, true); assert.equal(resourcesStarted, true);
  finishCategories([]); finishResources({ resources: [], total: 0, pages: 1, filters: { page: 1, q: "", categoryId: "", status: "ALL" } });
  assert.ok(await pending);
});

test("loading skeletons expose status text and exclude placeholder rows from assistive technology", () => {
  const ui = loadSource("src/components/ui.tsx", { "react/jsx-runtime": jsxRuntime });
  const { PageLoading } = loadSource("src/components/page-loading.tsx", { "react/jsx-runtime": jsxRuntime, "@/components/ui": ui });
  for (const variant of ["table", "form", "detail"]) {
    const html = renderToStaticMarkup(React.createElement(PageLoading, { title: "Loading resources", variant }));
    assert.match(html, /aria-busy="true"/); assert.match(html, /role="status"/);
    assert.match(html, /aria-hidden="true"/); assert.match(html, /Loading content/);
    assert.doesNotMatch(html, /animate-pulse/);
  }
});

test("submission lock rejects a second same-tick submission and releases on cancellation or completion", () => {
  const ref = { current: false }; let effect;
  const { useSubmissionLock } = loadSource("src/components/use-submission-lock.ts", { react: { useRef: () => ref, useEffect: (fn) => { effect = fn; } } });
  let lock = useSubmissionLock(false); effect();
  assert.equal(lock.acquire(), true); assert.equal(lock.acquire(), false);
  lock.release(); assert.equal(lock.acquire(), true);
  lock = useSubmissionLock(true); effect(); assert.equal(lock.acquire(), false);
  lock = useSubmissionLock(false); effect(); assert.equal(lock.acquire(), true);
});
