# Resource management

## Scope and routes

The existing `Resource` and `ResourceCategory` models are used. No models,
migrations, authentication logic or database records were changed during implementation.

- `/resources`: resource catalog for ADMIN, EMPLOYEE and DEPARTMENT_HEAD; name/code
  search, category/status filtering and 50-record pagination.
- `/resources/[id]`: operational details and booking-policy information. Inactive
  resources remain visible with explicit labels. No availability claims or booking action.
- `/admin/resources`: Admin directory, filters and activation/deactivation.
- `/admin/resources/new` and `/admin/resources/[id]/edit`: create/edit forms.
- `/admin/resource-categories`: Admin category list, resource/request counts and usage.
- `/admin/resource-categories/new` and `/admin/resource-categories/[id]/edit`: category forms.

All pages preserve request-time `connection()` boundaries and existing page guards.
The navigation highlights nested routes. Employees and department heads see Resources
but not administrative resource/category links or modification controls. Existing
employee/account navigation and logout/password flows remain available.

## Resource form refinements

Category classification uses native Standard Resource / Vehicle / Transport radios
backed by the existing `isVehicle` boolean. Classification describes booking flow;
`requiresApproval` is independent, and standard resources can also require approval.
Referenced categories retain their protected classification and code.

Resource/category inputs are controlled so validation failures preserve entered
values. Known duplicate errors identify the submitted code/name and associate with
the relevant field. Exact unique-key races are still rejected by PostgreSQL. When
a category unique error lacks constraint metadata, a safe form-level message names
both submitted values instead of guessing which field conflicted.

Vehicle forms hide Location and retain its stored value. The service also preserves
the current database location in the edit transaction, even if the submitted value
is empty. Standard resource locations remain optional and editable. Vehicle catalog
rows/details omit irrelevant location metadata. No database fields were changed.

Row deactivation and deactivation during editing share a native modal dialog. The
dialog names the resource, explains the new-booking policy and retained history,
focuses Cancel, supports Escape while idle and restores focus when closed. During
the request, controls/dismissal are disabled; synchronous submission locks prevent
same-tick duplicates. Failures remain visible and allow retry. Edit confirmation
also explains that other form edits will be saved. No reservations are changed.
Resource booking remains future functionality; its service must enforce `isActive`.

Desktop row actions share a horizontal column and 44px controls. On narrow screens
they may wrap inside the labelled, keyboard-focusable table scroll region. Native
selects use a shared chevron wrapper. Existing Suspense/loading/navigation feedback,
fonts, tokens, authorization, history protections and transaction locks are retained.

Regression tests use mock transactions, rendered markup and simulated dialog/hooks;
they do not prove real browser focus trapping or PostgreSQL concurrency behavior.
Authenticated browser checks should include Tab/Shift+Tab, Escape, pending double
clicks, error retry, mobile table scrolling and retained values after duplicate errors.

Files touched by this refinement (separate from the preceding rendering work):

- `src/components/category-form.tsx`
- `src/components/resource-form.tsx`
- `src/components/resource-status-control.tsx`
- `src/components/resource-list.tsx`
- `src/components/confirmation-dialog.tsx` (new)
- `src/components/ui.tsx`
- `src/app/globals.css`
- `src/app/(protected)/resources/[id]/page.tsx`
- `src/app/resource-actions.ts`
- `src/lib/resource-service.ts`
- `src/lib/resource-validation.ts`
- `src/lib/resource-types.ts`
- `tests/resource-actions.test.mjs`
- `tests/resource-management.test.mjs`
- `tests/resource-ux.test.mjs` (new)
- `docs/design-system.md`
- `docs/resource-management.md`

## Batch 1 presentation refinement

Native modal geometry is now explicit: fixed viewport insets, automatic centering,
480px width constrained by the viewport, intrinsic height and scrollable long content.
Scoped unlayered rules protect it from utility-layer spacing overrides. The native
top layer, keyboard semantics and existing mutation handlers remain intact. A subtle
shadow and dimmed/blurred backdrop distinguish the card; its effect also restores
background scroll settings on cleanup.

The reported top-left stretch could not be reproduced using the previous production
CSS and shared markup in the sample browser fixture. The previous rules relied on
browser-default positioning, and their component layer could lose to layout utilities;
these are addressed as CSS risks, not claimed as a confirmed cause of that report.
No authenticated browser was available to inspect the original failing application.

Browser QA did reproduce mobile page overflow from absolutely positioned screen-reader
labels inside a table without a positioning context. Adding `position: relative` to
the table scroll region contained that overflow (375px viewport: root scroll width
changed from 804px to 375px). The table itself still scrolls horizontally.

Resource identity has stronger navy text, muted codes, subtle category badges,
warning/direct-booking policy badges and explicit active/inactive statuses. Edit is a
neutral shared button; primary, secondary and confirmed-destructive meanings remain
distinct. Compact Feedback replaces trivial success banners. Server field errors
retain entered data and focus the first enabled visible invalid control after pending
work/modal dismissal. No backend, authentication, schema or business-policy changes.

Changed files: `src/app/globals.css`, `src/components/ui.tsx`,
`src/components/confirmation-dialog.tsx`, `src/components/use-validation-focus.ts` (new),
`src/components/category-form.tsx`, `src/components/resource-form.tsx`,
`src/components/resource-status-control.tsx`, `src/components/resource-list.tsx`,
`src/app/(protected)/admin/resource-categories/page.tsx`, `tests/resource-ux.test.mjs`,
`docs/design-system.md`, and this document.

The temporary fixture uses sample records, actual rendered shared markup/compiled
CSS and a small native-dialog event bridge, with no database access. It checks CSS
centering, native keyboard behavior and responsiveness; it is not authenticated
React/Server Action end-to-end coverage. Live mutation success/failure, modal pending
states, error focus and retained values still need authenticated browser verification.

Final fixture checks passed at 1440×900 and 390×844: native modal card centered and
within bounds, Inter body/Urbanist heading fonts, Cancel/Escape dismissal and restored
trigger focus, and no page-level horizontal overflow. Desktop Edit/status controls
shared the same vertical position and 44px height. The sample fixture was removed
after QA. TypeScript, full ESLint, tests and webpack build passed; an intermediate
webpack WASM cache error required clearing only `.next/cache/webpack` and rebuilding.

## Server validation and authorization

Services in `src/lib/resource-service.ts` use existing current-database guards.
Every mutation requires normal-access ADMIN, and rechecks role, ACTIVE status,
mandatory-password flag and sessionVersion inside the transaction under a User row
lock. Hidden IDs/revisions and checkbox values are untrusted and validated.
Mutation rate limits reuse the existing shared limiter: 60 writes/Admin/minute.
The existing production/Vercel shared-Redis requirement still applies; missing
production limiter configuration fails closed rather than bypassing protection.

Organizational codes are trimmed, uppercased ASCII identifiers, 2–64 characters,
starting with a letter/number, followed by letters/numbers/hyphens/underscores.
Resource names are 1–120 trimmed characters; category names 1–100. Category
description supports 2000 characters, location 200. Capacity is null or a positive
integer up to PostgreSQL's signed 32-bit limit. Vehicle resources require approval.
Search is a literal case-insensitive substring; PostgreSQL ILIKE metacharacters
(`%`, `_`, backslash) are escaped rather than treated as search wildcards.

Category code/name and resource code duplicate checks use parameterized literal
SQL, including legacy casing/whitespace. A transaction-scoped advisory lock
`(742019, 3)` serializes all app resource/category writers across instances. The
existing database unique constraints reject exact duplicate races. Case-insensitive
uniqueness also depends on all app writers using this service; external SQL writers
must preserve canonical values. No claim is made that the existing case-sensitive
PostgreSQL unique keys alone reject every legacy mixed-case collision.

Forms submit the record's existing `updatedAt`; a stale edit/toggle is rejected
rather than overwriting another Admin's work. Resource/category rows are locked
before history checks. PostgreSQL FK insertion locks conflict with these `FOR UPDATE`
locks, closing the gap between reference checks and edits for newly inserted references.
Transactions use ReadCommitted so checks see completed concurrent writes after
waiting. Future reservation/allocation writers must lock/recheck category/resource
policy during allocation and use a consistent lock order, rather than assuming
these management checks replace reservation-side integrity rules.

Prisma constraint, missing-reference, contention and stale-edit errors receive
safe messages. Unexpected errors return a generic failure without logging input,
database connection strings or raw Prisma errors to clients. Server Actions use
fixed redirects, Next's origin checks and path revalidation after committed writes.

## History policy

- There are no resource or category delete handlers. Resources can be deactivated
  and reactivated. Existing reservations/approvals are never deleted, cancelled or
  reassigned as a side effect of deactivation.
- `isActive` describes operational status. It is not a date/time availability flag.
- A category's code and `isVehicle` are immutable once referenced by any resource
  or requested-category reservation. Names/descriptions remain editable. Existing
  JSON metadata is preserved because update data never replaces it.
- A resource's category and `requiresApproval` cannot change if it is referenced
  by **any** reservation, regardless of status, or its current category has any
  category-only request (`resourceId IS NULL`). The conservative category-only
  restriction covers the absence of a booking-policy snapshot in the current schema.
  Create a new resource/category when a new policy is needed; do not rewrite history.
- Resource names/codes/capacity/location/status remain editable. Future booking
  code must validate capacity and operational eligibility afresh; this module
  does not cancel future confirmed bookings when those operational details change.
- Vehicle booking/allocation and driver assignment are future Reservation Management
  work. This feature marks vehicles explicitly and requires approval for new/edited
  vehicle resources, without implementing a booking workflow.

## Schema gap

`Resource` has **no description field**. Category descriptions are supported; resource
forms intentionally omit a description field instead of abusing category metadata
or duplicating it in location. No migration is required for this feature.
If individual resource descriptions become required, the smallest proposed change is
`description String?` in `Resource`, followed by a new additive migration equivalent
to `ALTER TABLE "Resource" ADD COLUMN "description" TEXT;`. This proposal has not
been implemented or applied. Existing Prisma 7 configuration/client paths and
all database CHECK/exclusion constraints remain intact.

## Validation commands

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src tests --ignore-pattern "src/generated/**"
node --test tests/auth-backend.test.mjs tests/admin-bootstrap.test.mjs tests/account-security.test.mjs tests/rate-limit.test.mjs tests/authentication.integration.test.mjs tests/resource-management.test.mjs tests/resource-actions.test.mjs tests/resource-management.integration.test.mjs
npx next build --webpack
```

Resource unit tests exercise the actual service/validation and authorization code
with mocked PostgreSQL boundaries. They cover all roles, first-login/stale/disabled
accounts, invalid fields/IDs, canonical duplicates, simulated concurrent creation,
metadata preservation, referenced policy restrictions, deactivation, optimistic
conflicts, rate/DB errors, literal search and filtering. Server Action tests cover
forged role inputs, unauthorized writes, fixed redirects and sanitized errors.
Mocked concurrency and
search behavior are **not** real PostgreSQL verification.

An optional integration test requires explicitly exported `TEST_DATABASE_URL`
pointing to a distinct dedicated database whose name ends `_test`, with existing
reviewed migrations applied beforehand. It tests actual category/resource SQL,
literal special-character search, duplicate checks, reference protection and
deactivation, with isolated fixtures inside one transaction that always rolls back.
It never modifies the development database or ADMIN001. Without the variable it
is skipped. It does not verify simultaneous real connections or browser sessions.

## Manual browser checks

1. Start the app with valid DATABASE_URL/AUTH_SECRET. Production preview additionally
   needs the intended Auth.js trusted origin and shared Redis limiter configuration.
2. Sign in as a normal-access Admin. Open **Resource categories**, choose **Create
   category**, enter `MEETING_ROOM`, `Meeting rooms`, a description, and leave Vehicle
   unchecked. Save; verify success and usage count zero.
3. Add another category `VAN`, `Vans`, with Vehicle checked. Attempt case-only code/name
   duplicates; verify clear errors and no additional categories.
4. Open **Manage resources → Add resource**. Add `ROOM001`, a room name, Meeting rooms,
   capacity `12`, a location, Active checked, Approval unchecked. Verify save, details
   and catalog status. Try zero/negative/fractional capacity and duplicate `room001`.
5. Add a resource under Vans. Verify approval is forced and vehicle guidance is shown.
   Verify classification/code fields are protected when editing a referenced category;
   change only name/description and confirm successful preservation of usage.
6. Edit room name/location/capacity; verify updates. Open the same edit page in two
   tabs, save one, then submit the stale tab; verify a reload-required error.
7. Deactivate the room, accept confirmation, and verify Inactive in catalog/filter.
   Reactivate it and verify Active. No reservation history should be altered.
8. Filter by category, Active/Inactive and case-insensitive name/code. Search `%`, `_`
   and backslash where such characters exist in names; they must be literal.
9. Sign in as EMPLOYEE and DEPARTMENT_HEAD. Browse resources/details including inactive
   ones; verify no edit/deactivation/category-management controls. Visiting Admin URLs
   should redirect to dashboard, and direct mutation attempts must be rejected.
10. Verify unauthenticated routes redirect to login and first-login accounts redirect
    to password change. Check keyboard focus, form labels, narrow viewport/table scrolling,
    error feedback, current navigation and existing logout/password/employee flows.

Use only disposable test fixtures for reservation-reference checks: seed a dedicated
test database privately, then verify category/approval edits are rejected for assigned
and category-only history. Do not create/alter real reservations merely to test policy.

## File inventory

New backend files: `src/lib/resource-service.ts`, `resource-validation.ts`,
`resource-types.ts`, and `src/app/resource-actions.ts`.
New UI files: `src/components/resource-list.tsx`, `resource-form.tsx`,
`category-form.tsx`, `resource-status-control.tsx`, and `resource-page-error.tsx`.
New routes, loading and error boundaries live under `src/app/(protected)/resources`,
`src/app/(protected)/admin/resources` and `src/app/(protected)/admin/resource-categories`.
Existing `src/components/workspace-navigation.tsx` and the dashboard page are updated.
New tests: `tests/helpers/resources.mjs`, `resource-management.test.mjs`,
`resource-actions.test.mjs`, and `resource-management.integration.test.mjs`.
This document is new. No dependency installation or schema migration was needed.

## Implementation validation

TypeScript and ESLint passed. The full suite reports 48 passing tests, zero
failures and two skipped dedicated-PostgreSQL tests because TEST_DATABASE_URL was
not configured. `npx next build --webpack` passed and includes every new route.
An initial internal webpack hash/cache error was resolved by clearing only
`.next/cache/webpack` and rebuilding; no font-download failure remained.
The final adjustment to catalog copy does not alter filtering or authorization.
Read-only production preview confirmed unauthenticated catalog and Admin routes
redirect to login, with the preview's explicit process-only localhost AUTH_URL.

There was no authenticated browser session available for actual CRUD/visual
verification. No credentials were requested, no real organizational records were
created for testing, and live PostgreSQL/concurrent-connection behavior is not
claimed as verified. Complete the manual checks above in a private test environment.
