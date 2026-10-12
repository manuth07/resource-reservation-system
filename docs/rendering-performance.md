# Rendering and navigation

## Diagnosis and evidence

The installed Next.js 16.4 guides for instant navigation, loading, authentication
and `useLinkStatus` were reviewed. Cache Components and Partial Prefetching remain
enabled. No warnings/validation settings were disabled.

Previously, the root layout had Suspense around the entire app, but the protected
layout and page defaults awaited connection, authentication, URL data and database
reads before returning content. Existing `loading.tsx` files wrap their page, not
the layout in their segment. The root fallback can cover document loads but lies
above the reused shared-layout scope on client navigations. The installed guide
explicitly explains why a successful direct load/build does not prove that every
client navigation has an immediately renderable fallback.

Those were confirmed structural issues and a plausible explanation of the reported
uncached-data navigation warning. The available local log showed historical
crypto/prerender warnings and development cache-bypass messages, but not the exact
reported uncached-data error. No authenticated browser session was available to
reproduce the reported warning or 919ms navigation.

Development compiles routes on demand and does not automatically prefetch like
production. GET duration is not click-to-feedback latency or a Prisma query trace.
Cold compilation, session/database latency and network conditions must be separated
when profiling. No measured authenticated speed improvement is claimed.

## Boundaries and privacy

The protected layout now synchronously returns its own Suspense around an async
authenticated workspace. Account details, role navigation and private content
remain behind the existing guard. Pages similarly return local Suspense boundaries;
their asynchronous children retain connection, guards, parameters and database work.
These local boundaries cover navigation scopes where the root boundary is reused.

`connection()` stays inside the async children so session checks occur on real
requests. Production Links can prefetch static skeletons; private authorization
data is not given a persistent shared or browser-private cache. Existing error
boundaries remain active, and unexpected errors propagate rather than being hidden.
No `instant=false`, global dynamic flag or shared `use cache` was introduced.

Route loading files use table/form/detail skeletons. Placeholders are decorative
(`aria-hidden`) with visible status text and `aria-busy`. They are rectangular,
static and unanimated; there is no full-screen navigation overlay or shimmer.

## Database work

The current-user lookup uses React `cache`, which deduplicates **only within a Server
Component render pass**. It is not the Next Data Cache and is not reused between
users/requests. The installed authentication guide states that actions/handlers
are outside a render pass, so this wrapper does not memoize their operations.
Sensitive mutations still re-read and lock the current account in their transaction.
Role, ACTIVE status, mandatory-password and captured session-version checks remain.

The direct Admin resource-list path previously performed four User reads in layout,
page, category-options service and resource-list service, plus three genuine data
queries (categories, rows, count). Those identity calls now share one read per render;
every caller still checks the permissions it requires. This reduction is inferred
from code, not measured with an authenticated SQL trace. Layout-reusing navigations
have a different baseline count.

Category and resource-list reads now start together. Row and count queries are both
retained because they serve distinct pagination purposes. A private lookup helper
avoids re-entering the employee guard after the Admin edit guard. All exported
services remain authorized. Reservation/history and mutation rules are unchanged.

## Feedback and submissions

`NavigationLink` uses `useLinkStatus` inside Link, retains default prefetch behavior
and reserves a small inline pending hint with polite text. Its spinner respects
reduced motion. Prefetched navigations may skip pending and show the route fallback
instead. Pages remain Server Components; no client-side fetching was introduced.

Existing pending labels and disabled action controls remain. `useSubmissionLock`
adds an immediate ref guard for repeated events before React renders pending.
Completion resets it; cancelled confirmation releases it. Database uniqueness,
optimistic revision checks and transactional authorization are still authoritative;
UI locking is not a security/idempotency boundary.

## Validation and profiling

Run TypeScript, ESLint, all existing tests plus `tests/rendering.test.mjs`, and
`npx next build --webpack`. The rendering tests check local boundaries before I/O,
parallel read startup, accessible skeleton markup and same-tick locking. Memoization
scope tests use a **simulated render adapter** and test real React behavior outside
a render; they do not claim actual PostgreSQL traces or Next browser timings.

For a fair authenticated before/after comparison:

1. Use the same test database/account, machine, browser and network. Warm each route
   first and record cold first-compilation separately. Do not run competing dev builds.
2. Record Dashboard → Manage resources → Categories → resource edit/details → back.
   Measure click-to-first-visible-feedback and click-to-complete-content separately,
   plus RSC response duration; repeat several times rather than selecting one sample.
3. Repeat in development and a webpack production build with `next start` and the
   intended trusted Auth.js origin. Production prefetch behavior differs from dev.
4. Inspect warnings and Next's Navigation Inspector at shared-layout scopes. Do not
   opt out of validation to obtain a pass. Reset inspector/throttling afterward.
5. If tracing Prisma in a private test environment, record aggregate counts/durations
   only; never log parameters, passwords, hashes or connection strings.
6. Recheck Employee/HOD restrictions, first-login gating, session revocation and
   double-submit behavior under throttling.

No Prisma schema, migration or reservation business rule was changed.

## Results in this workspace

TypeScript, ESLint and `npx next build --webpack` passed. The full suite has
54 passing tests, zero failures and two skipped dedicated-PostgreSQL tests.
The built Admin resource static shell contains loading markup; the known Admin
identifier is absent from that shell (a limited check, not a complete privacy audit).
A temporary production preview with an explicit process-only localhost AUTH_URL
showed streamed loading feedback and preserved unauthenticated Admin redirects
to login, without runtime warnings in its output. No private data or database
record was changed during validation. The authenticated dev warning and original
919ms measurement remain unverified; follow the profiling steps above.
