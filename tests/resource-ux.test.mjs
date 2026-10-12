import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./helpers/source.mjs";
import { categoryId, resourceId, timestamp, resourceInput, categoryInput } from "./helpers/resources.mjs";

const ui = loadSource("src/components/ui.tsx", { "react/jsx-runtime": jsxRuntime });
const dialog = loadSource("src/components/confirmation-dialog.tsx", { react: React, "react/jsx-runtime": jsxRuntime, "@/components/ui": ui });
const category = { id: categoryId, ...categoryInput, updatedAt: timestamp, resourceCount: 0, reservationCount: 0 };
const resource = { ...resourceInput, id: resourceId, capacity: 12, updatedAt: timestamp, category };

function nodes(element) {
  if (!element || typeof element !== "object") return [];
  return [element, ...React.Children.toArray(element.props?.children).flatMap(nodes)];
}

function hookHarness() {
  const slots = []; let cursor = 0; let locked = false;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {},
  };
  return { hooks, render(fn, props) { cursor = 0; return fn(props); }, lock: { acquire() { if (locked) return false; locked = true; return true; }, release() { locked = false; } } };
}

function forms(result = {}, pending = false) {
  const mocks = {
    react: { ...React, useActionState: () => [result, () => {}, pending] },
    "react/jsx-runtime": jsxRuntime,
    "@/components/ui": ui,
    "@/components/navigation-link": { NavigationLink: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/app/resource-actions": { saveCategoryAction: () => {}, saveResourceAction: () => {} },
    "@/components/use-submission-lock": { useSubmissionLock: () => ({ acquire: () => true, release: () => {} }) },
    "@/components/confirmation-dialog": dialog,
    "@/components/use-validation-focus": { useValidationFocus() {} },
  };
  return {
    ...loadSource("src/components/category-form.tsx", mocks),
    ...loadSource("src/components/resource-form.tsx", mocks),
  };
}

test("classification uses labelled native radios, separates approval policy and preserves referenced classification", () => {
  const { CategoryForm } = forms();
  const html = renderToStaticMarkup(React.createElement(CategoryForm, { category }));
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.match(html, /Standard Resource/); assert.match(html, /Vehicle \/ Transport/);
  assert.match(html, /standard resources may also require Department Head approval/);
  assert.match(html, /type="radio"[^>]*name="isVehicle" checked="" value="false"/);
  const locked = renderToStaticMarkup(React.createElement(CategoryForm, { category: { ...category, resourceCount: 1, isVehicle: true } }));
  assert.match(locked, /<fieldset disabled="" aria-describedby="classification-help"/);
  assert.match(locked, /type="hidden"[^>]*name="isVehicle"[^>]*value="true"/);
});

test("inline code errors are associated with populated controls and pending forms disable submission", () => {
  const error = "Resource code ROOM_001 is already in use. Enter a unique code.";
  const { ResourceForm, CategoryForm } = forms({ error, fieldErrors: { resourceCode: error, code: "Category code MEETING_ROOM is already in use." } });
  const html = renderToStaticMarkup(React.createElement(ResourceForm, { categories: [category], resource }));
  assert.match(html, /aria-describedby="resource-code-hint resource-code-error"/);
  assert.match(html, /id="resource-code-error" role="alert"/);
  assert.match(html, /value="ROOM_001"/); assert.match(html, /value="Conference room"/);
  const categoryHtml = renderToStaticMarkup(React.createElement(CategoryForm, { category }));
  assert.match(categoryHtml, /aria-describedby="category-code-hint category-code-error"/);
  const busy = renderToStaticMarkup(React.createElement(forms({}, true).ResourceForm, { categories: [category] }));
  assert.match(busy, /aria-busy="true"/); assert.match(busy, /<fieldset disabled=""/); assert.match(busy, /Saving…/);
});

test("vehicle form hides location but carries legacy metadata and enforces approval; standard form shows optional location", () => {
  const { ResourceForm } = forms();
  const vehicle = { ...category, isVehicle: true };
  const html = renderToStaticMarkup(React.createElement(ResourceForm, { categories: [vehicle], resource: { ...resource, requiresApproval: true, location: "Legacy garage", category: vehicle } }));
  assert.match(html, /type="hidden" name="location" value="Legacy garage"/);
  assert.doesNotMatch(html, /id="resource-location"/);
  assert.match(html, /type="hidden" name="requiresApproval" value="true"/);
  const standard = renderToStaticMarkup(React.createElement(ResourceForm, { categories: [category], resource }));
  assert.match(standard, /Location \(optional\)/); assert.match(standard, /2nd Floor, Building A/);
  assert.doesNotMatch(standard, /type="hidden" name="requiresApproval"/);
});

test("native dialog focuses Cancel, restores focus, supports Escape and prevents dismissal while pending", () => {
  class Element { isConnected = true; focused = false; focus() { this.focused = true; } }
  const previous = new Element(); const cancel = new Element();
  const native = { opened: false, showModal() { this.opened = true; }, close() { this.opened = false; } };
  const body = { style: { overflow: "auto" } };
  let effect; let refs = 0; let cancelled = 0;
  const { ConfirmationDialog } = loadSource("src/components/confirmation-dialog.tsx", {
    react: { useId: () => "confirm", useRef: () => ({ current: refs++ === 0 ? native : cancel }), useEffect: (fn) => { effect = fn; } },
    "react/jsx-runtime": jsxRuntime, "@/components/ui": ui,
  }, undefined, { document: { activeElement: previous, body }, HTMLElement: Element });
  const props = { open: true, title: "Deactivate Van A?", description: "History is preserved.", confirmLabel: "Deactivate", onCancel: () => { cancelled++; }, onConfirm: () => {} };
  const element = ConfirmationDialog(props);
  const cleanup = effect();
  assert.equal(native.opened, true); assert.equal(cancel.focused, true);
  assert.equal(body.style.overflow, "hidden");
  assert.equal(element.type, "dialog"); assert.equal(element.props["aria-labelledby"], "confirm-title");
  let prevented = false;
  element.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(cancelled, 1);
  cleanup(); assert.equal(native.opened, false); assert.equal(previous.focused, true);
  assert.equal(body.style.overflow, "auto");
  refs = 0;
  const busy = ConfirmationDialog({ ...props, pending: true });
  busy.props.onCancel({ preventDefault() {} });
  assert.equal(cancelled, 1);
  const html = renderToStaticMarkup(busy);
  assert.match(html, /Deactivating…/); assert.match(html, /aria-busy="true"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});

test("vehicle catalog and details omit location; table actions keep native keyboard-scroll access", async () => {
  const vehicle = { ...resource, category: { ...category, isVehicle: true }, requiresApproval: true, location: null };
  const mocks = {
    react: React, "react/jsx-runtime": jsxRuntime, "@/components/ui": ui,
    "@/components/navigation-link": { NavigationLink: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/resource-status-control": { ResourceStatusControl: () => React.createElement("button", null, "Deactivate") },
    "@/lib/resource-service": { listCategoryOptions: async () => [vehicle.category], listResources: async () => ({ resources: [vehicle], total: 1, pages: 1, filters: { q: "", categoryId: "", status: "ALL", page: 1 } }), getResource: async () => vehicle },
    "@/lib/resource-validation": { ResourceManagementError: class extends Error {} },
    "next/server": { connection: async () => {} }, "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/lib/page-auth": { requirePageUser: async () => ({ role: "ADMIN" }) }, "@/components/page-loading": { PageLoading: () => null },
  };
  const { ResourceList } = loadSource("src/components/resource-list.tsx", mocks);
  const html = renderToStaticMarkup(await ResourceList({ searchParams: {}, admin: true }));
  assert.doesNotMatch(html, /Location not specified/);
  assert.match(html, /md:flex-nowrap/); assert.match(html, /role="region"[^>]*tabindex="0"/);
  assert.match(html, /status-warning/); assert.match(html, /status-success/); assert.match(html, /status-subtle/);
  assert.match(html, /button-neutral/); assert.match(html, /text-foreground font-semibold/);
  assert.equal((html.match(/class="select-control"/g) ?? []).length, 2);
  const page = loadSource("src/app/(protected)/resources/[id]/page.tsx", mocks).default({ params: Promise.resolve({ id: resourceId }) });
  const content = await page.props.children.type(page.props.children.props);
  assert.doesNotMatch(renderToStaticMarkup(content), />Location</);
});

test("validation focus waits for pending/modal completion and skips hidden or disabled controls", () => {
  let effect; let calls = 0; let focused = 0;
  const { useValidationFocus } = loadSource("src/components/use-validation-focus.ts", { react: { useEffect: (callback) => { effect = callback; } } });
  const form = { current: { querySelector(selector) { calls++; assert.match(selector, /:not\(:disabled\)/); assert.match(selector, /:not\(\[type="hidden"\]\)/); return { focus() { focused++; } }; } } };
  useValidationFocus(form, { resourceCode: "Duplicate code" }, false); effect(); assert.equal(calls, 0);
  useValidationFocus(form, undefined, true); effect(); assert.equal(calls, 0);
  useValidationFocus(form, {}, true); effect(); assert.equal(calls, 0);
  useValidationFocus(form, { resourceCode: "Duplicate code" }, true); effect(); assert.equal(focused, 1);
});

test("compact feedback uses accessible roles and neutral buttons retain shared disabled semantics", () => {
  const success = renderToStaticMarkup(React.createElement(ui.Feedback, { tone: "success" }, "Resource saved successfully."));
  const failure = renderToStaticMarkup(React.createElement(ui.Feedback, { tone: "danger" }, "Reload and retry."));
  assert.match(success, /role="status"/); assert.match(success, /feedback-compact/);
  assert.match(failure, /role="alert"/);
  const button = renderToStaticMarkup(React.createElement(ui.Button, { variant: "neutral", disabled: true, type: "button" }, "Edit"));
  assert.match(button, /button-neutral/); assert.match(button, /disabled=""/);
});

test("typed form values survive a simulated validation response; edit deactivation requires confirmation and suppresses duplicate submits", () => {
  const harness = hookHarness(); let result = {}; let prevented = 0;
  const { ResourceForm } = loadSource("src/components/resource-form.tsx", {
    react: { ...harness.hooks, useActionState: () => [result, () => {}, false] },
    "react/jsx-runtime": jsxRuntime, "@/components/ui": ui, "@/components/confirmation-dialog": dialog,
    "@/components/navigation-link": { NavigationLink: () => null }, "@/app/resource-actions": { saveResourceAction: () => {} },
    "@/components/use-submission-lock": { useSubmissionLock: () => harness.lock },
    "@/components/use-validation-focus": { useValidationFocus() {} },
  });
  const props = { resource, categories: [category] };
  let tree = harness.render(ResourceForm, props);
  nodes(tree).find((node) => node.props?.name === "resourceCode").props.onChange({ target: { value: "ROOM_NEW" } });
  nodes(tree).find((node) => node.props?.name === "name").props.onChange({ target: { value: "Entered name" } });
  result = { error: "Duplicate code", fieldErrors: { resourceCode: "Duplicate code" } };
  tree = harness.render(ResourceForm, props);
  assert.equal(nodes(tree).find((node) => node.props?.name === "resourceCode").props.value, "ROOM_NEW");
  assert.equal(nodes(tree).find((node) => node.props?.name === "name").props.value, "Entered name");
  nodes(tree).find((node) => node.props?.name === "isActive").props.onChange({ target: { checked: false } });
  tree = harness.render(ResourceForm, props);
  const form = nodes(tree).find((node) => node.type === "form");
  form.props.onSubmit({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  tree = harness.render(ResourceForm, props);
  const confirmation = nodes(tree).find((node) => node.type === dialog.ConfirmationDialog);
  assert.equal(confirmation.props.open, true);
  let accepted = 0;
  form.props.ref.current = { requestSubmit() { let blocked = false; nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() { blocked = true; } }); if (!blocked) accepted++; } };
  confirmation.props.onConfirm(); confirmation.props.onConfirm();
  assert.equal(accepted, 1);
});

test("row deactivation cancellation sends no request and repeated confirmation sends only one", async () => {
  const harness = hookHarness(); const operations = []; let calls = 0;
  const { ResourceStatusControl } = loadSource("src/components/resource-status-control.tsx", {
    react: { ...harness.hooks, useTransition: () => [false, (fn) => { operations.push(fn()); }] },
    "react/jsx-runtime": jsxRuntime, "@/components/ui": ui, "@/components/confirmation-dialog": dialog,
    "@/app/resource-actions": { setResourceActiveAction: async () => { calls++; return {}; } },
    "@/components/use-submission-lock": { useSubmissionLock: () => harness.lock },
  }, undefined, { FormData });
  let tree = harness.render(ResourceStatusControl, { resource });
  nodes(tree).find((node) => node.type === ui.Button).props.onClick();
  tree = harness.render(ResourceStatusControl, { resource });
  nodes(tree).find((node) => node.type === dialog.ConfirmationDialog).props.onCancel();
  assert.equal(calls, 0);
  tree = harness.render(ResourceStatusControl, { resource });
  nodes(tree).find((node) => node.type === ui.Button).props.onClick();
  tree = harness.render(ResourceStatusControl, { resource });
  const confirm = nodes(tree).find((node) => node.type === dialog.ConfirmationDialog);
  confirm.props.onConfirm(); confirm.props.onConfirm();
  await Promise.all(operations);
  assert.equal(calls, 1);
  tree = harness.render(ResourceStatusControl, { resource });
  assert.equal(nodes(tree).find((node) => node.type === dialog.ConfirmationDialog).props.open, false);
});
