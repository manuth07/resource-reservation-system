# PrimeWave design system

Use this document for every frontend task, including future resource and reservation
management. The interface is internal enterprise software: clarity, predictable
navigation and readable data take priority over decoration.

## Principles

- Keep the navy-and-teal identity consistent. Use semantic tokens, not a separate
  color palette per page or dashboard section.
- Prefer native HTML and small shared components. Do not add a UI framework for
  patterns already supported by React, HTML and Tailwind.
- Prefer tables for management lists. Cards group related content; they are not a
  substitute for comparing records across consistent columns.
- No emojis, gradients, glow, glass effects, oversized marketing art, pills,
  large rounded panels, decorative animation, or default shadows.
- UI visibility is convenience; every protected read and mutation still requires
  current server-side authorization. Do not change backend behavior to style a page.

## Implementation and tokens

Tailwind **4.3.3** uses CSS-first configuration. `src/app/globals.css` owns CSS
variables, `@theme inline` utility mappings and shared component classes. There is
no separate Tailwind JavaScript configuration. Keep global CSS imported once by
the root layout. `postcss.config.mjs` uses `@tailwindcss/postcss` for webpack builds;
the existing Turbopack loader configuration remains in place.

| CSS token | Value | Intended use |
| --- | --- | --- |
| `--foreground` | `#071126` | Navy primary text and branding |
| `--primary` | `#087F78` | Teal primary actions and links |
| `--background` | `#F5F7FA` | Application canvas |
| `--surface` | `#FFFFFF` | Panels and surfaces |
| `--border` | `#D9E1EA` | Structural panel/table separators |
| `--secondary` | `#526176` | Descriptions, labels and navigation |
| `--muted` | `#64748B` | Supporting text and placeholders |
| `--control-border` | `#8191A5` | Visible input/button boundaries |
| `--primary-hover` / `--primary-active` | `#066B65` / `#055B56` | Teal interaction states |
| `--on-primary` | `#FFFFFF` | Text on primary/danger buttons |
| `--accent-on-dark` / `--muted-on-dark` | `#5EEAD4` / `#C4D1E2` | Teal accent and supporting text on navy login panel |
| `--focus` | `#087F78` | Focus outline, 2px with 3px offset |
| `--disabled` / `--disabled-foreground` | `#E9EEF3` / `#526277` | Disabled controls |
| `--input` | `#FFFFFF` | Input background |
| `--table-header` | `#EDF1F6` | Column headings and neutral status |
| `--navigation-selected` | `#E5F3F1` | Soft teal control/policy background |
| `--sidebar` / `--sidebar-text` | `#071126` / `#D8E2EF` | Dark workspace sidebar and light links |
| `--sidebar-muted` / `--sidebar-selected` | `#8FA2BD` / `#182A3F` | Navigation groups and selected/hover fill |
| `--sidebar-border` | `#1E2C3E` | Sidebar dividers |
| `--success` / `--success-surface` | `#176544` / `#EDF7F0` | Successful outcomes, Active |
| `--warning` / `--warning-surface` | `#78520D` / `#FFF6DF` | Attention or blocked prerequisites |
| `--danger` / `--danger-surface` | `#A22C35` / `#FCEDEE` | Errors and destructive actions |
| `--danger-hover` | `#87232B` | Destructive action hover |
| `--info` / `--info-surface` | `#25588C` / `#EDF4FB` | Informational states |

### Category Color System

Resource categories use distinct, restrained semantic color styles. All foreground/background
pairings exceed WCAG AA 4.5:1 contrast requirements:

| Classification | Background | Text | Border | Contrast ratio |
| --- | --- | --- | --- | --- |
| Meeting Rooms | `#E8F1FA` | `#28577C` | `#BFD3E6` | 6.1:1 |
| Vehicles / Transport | `#FFF1DA` | `#875A17` | `#E8CE9F` | 5.3:1 |
| Equipment / Projectors | `#F0EBF9` | `#644E87` | `#D7C9ED` | 6.4:1 |
| Training Facilities | `#E8F3EA` | `#286846` | `#C2DDC9` | 5.6:1 |
| Custom Slate Fallback | `#F1F4F8` | `#3E4D63` | `#CBD5E1` | 6.9:1 |

Use utilities such as `bg-surface`, `text-secondary`, `text-muted`, `border-border`,
`text-primary`, and `font-heading`. Status and feedback classes consume the same
CSS variables. Hex values belong in token definitions, not repeated JSX.
`--border` is intentionally subtle; use the stronger `--control-border` for
interactive control boundaries. Never render pale backgrounds as text colors.

## Typography

The root layout loads **Urbanist** and **Inter** through `next/font/google` with
Latin subsets, variable weights and `display: swap`. Urbanist is for page/section
headings and branding; Inter is for navigation, body, tables, labels and controls.
The fonts are self-hosted by Next after build-time downloading; no browser Google
request or unmanaged font files are introduced. An initial build needs network
access to download them. Report download failures separately from source errors.
System Arial/sans-serif fallbacks are configured for unavailable fonts.

| Pattern | Size / weight | Line height |
| --- | --- | --- |
| `.page-title` | 28px / 700 | 1.25 |
| `.section-title` | 20px / 600 | 1.4 |
| `.card-title` | 18px / 600 | 1.4 |
| Body and tables | 14px / 400 | 1.6 |
| Form labels | 14px / 500 | 1.6 |
| Button labels | 14px / 600 | 1.5 |
| Supporting text | 12px / 400 | 1.6 |

Body copy can use 16px when justified, without enlarging the entire table or form.
Use `tabular-nums` for counts, capacity, dates and statistics; data tables already
enable it. Avoid thin type, uppercase blocks and excessive tracking.

## Spacing and shapes

Use an 8px rhythm: Tailwind `2`, `4`, `6`, `8`, `12` correspond to 8, 16, 24, 32,
48px. Use 8px label/input gaps, 20px editor field gaps, 24px editor padding and 24px
between major sections. Directory headers/controls use 16–20px padding; table cells
use 12px vertical / 16px horizontal padding. On mobile use 16px page gutters;
at tablet/desktop use 32px horizontal gutters.
Tiny typographic details and thin borders may fall outside that rhythm.

- Panels, cards, tables and feedback: **0px radius**.
- Inputs, buttons and account controls: **4px maximum**.
- Status badges: **2px maximum**.
- Dialogs: **0–4px**, 1px border. Shadows only if required to distinguish layering.
- Surfaces and tables: thin 1px borders; no default shadows.
- Buttons/inputs: minimum 44px height for usable interaction targets.

## Shared components

Import from `@/components/ui`:

- `Button`: `primary` (default), `secondary`, `neutral`, `danger`. Always set `type` in forms.
  Resource Edit actions use neutral gray; confirmed deactivation uses danger.
  Use primary for the main action, secondary for auxiliary actions. Use the same
  `.button .button-primary` classes on links that navigate rather than submit.
- `Input`: native input props and `.field`. Textareas use `.field`.
- `Select`: native select with a decorative chevron, matching input height/padding
  and native keyboard behavior. Use it for resource category/status controls.
- `FormField`: explicit `id`, visible `label`, optional `required`, `hint` and `error`.
  Consumers connect hints/errors using `aria-describedby="<id>-hint <id>-error"`
  and set `aria-invalid` on invalid controls. It does not clone children.
- `ConfirmationDialog` (from `@/components/confirmation-dialog`): native modal dialog with a labelled title/description,
  Cancel-first focus and focus restoration. Escape dismisses while idle; pending
  operations disable dismissal and both buttons until the request completes.
  Callers retain their synchronous submission lock and authoritative Server Action.
  Its scoped CSS sits outside utility layers, with fixed viewport insets, auto
  margins, a 480px maximum card, small shadow and dimmed/blurred backdrop. Native
  `showModal()` provides the top layer; do not replace it with an `open` attribute.
  The effect locks background scrolling and restores its previous overflow value.
- `Feedback`: compact semantic feedback for resource success/error messages;
  success uses `role="status"`, errors use `role="alert"`. Keep field errors inline.
- `useValidationFocus` (from `@/components/use-validation-focus`): focus the first enabled, visible invalid resource/category
  control after server validation, after pending/modal state has completed.
- `Card`: rectangular section with optional accessible label; padding is supplied
  by the caller. Supply a heading inside it for semantic content structure.
- `PageHeader`: one page title, optional section label, description and action slot.
  The action sits at the upper right on desktop and wraps naturally on mobile.
- `StatusBadge`: `success`, `warning`, `danger`, `info`, `neutral`. Always include
  meaningful visible text; the badge alone is not an ARIA live region.
  Resource categories use subtle neutral badges; booking policies use warning
  (approval) or accent (direct booking), with clear text independent of color.
- `EmptyState`: explain what is absent and what to do next; optional valid action.
- `LoadingState`: a polite status message without decorative animation.
- `PageLoading`: table/form/detail skeletons with accessible status text. Decorative
  placeholders are hidden from assistive technology and have no shimmer animation.
- `NavigationLink`: default Next prefetching plus a small inline pending hint;
  its spinner respects reduced motion.
- `DataTable`: labelled scrollable region and native table with caption. Callers
  provide `thead`, `tbody`, scoped column headers and rows. No generic sorting,
  filtering or pagination framework is added before those needs exist.

`PasswordField` remains a small client component with a labelled native input,
visibility toggle, `aria-controls`, and `aria-pressed`. Shared primitives have no
authentication, database or routing dependencies. Do not pass secrets to primitives
except the existing authorized, one-time temporary-credential response.

## Form conventions

- Keep visible labels and correct input types/autocomplete. Required/bounded
  fields use native validation plus existing authoritative server validation.
- Put instructions immediately after their field and associate them programmatically.
- For field errors use `aria-invalid` and `aria-describedby` with concise text.
  Cross-field/server errors use `role="alert"` and `.feedback.feedback-danger`.
- Success messages use `role="status"`; pending operations use `aria-busy`, polite
  status text and disabled submission controls. Do not remove labels while loading.
- Use direct language: "Account created successfully." Avoid celebratory slogans.
- Keep existing state/submission patterns. Never send a previous temporary
  password back as action state, log credentials, or persist them in browser storage.
- Destructive/security-sensitive actions need confirmation describing the target
  and consequence. The existing credential-reset flow retains native
  `window.confirm`, avoiding a custom modal for one use case. Prefer a native
  dialog if a future richer confirmation is justified: labelled title, Cancel,
  explicit confirm, focus management, Escape dismissal, and focus restoration.

## Tables

Use sentence-case column names, text-aligned headers and consistent padding.
Put identity/name in the first column and actions at the end. Use text labels for
status. Numbers may be right-aligned; do not truncate critical identifiers without
a way to inspect the full value. Keep action target names accessible to screen readers.
Render a helpful empty state instead of an empty table. Future pagination/filtering
must show current criteria and result counts; do not add inactive decorative controls.

The table region can scroll horizontally and receive keyboard focus on narrow
screens. Content elsewhere must wrap without horizontal page overflow. Do not
replace tables with dense stacks of unrelated cards on mobile.
The scroll region establishes a positioning context to contain absolutely positioned
screen-reader labels. Resource tables use middle alignment and stronger identity text.

## Page and navigation patterns

Authenticated pages reuse `(protected)/layout.tsx`: brand/header, native account
menu, role-filtered navigation, and constrained main area through `WorkspaceShell`.
Account menu contains employee ID, current role, password link and logout. Only
Admins see Employees navigation. Do not expose links to unimplemented resource or
reservation pages; add them when working routes and server authorization exist.
`WorkspaceNavigation` sets `aria-current="page"`, selected fill and border.

The approved enterprise shell spans the viewport with a sticky 240px dark navy
sidebar at `lg` (1024px) and above. Workspace contains Dashboard and Resource catalog;
Administration contains Resources, Categories and Employees and renders only for
Admins. Group labels are muted; selected links have a lighter navy fill and teal
left indicator border. The sidebar footer houses the single unified account control:
a compact initials avatar, employee ID, role badge, and expandable menu for Change
password and Sign out. The topbar is clean, containing route context and breadcrumbs
without duplicate user identity on desktop.

Below `lg`, the sidebar is replaced by a native Menu disclosure in the topbar alongside
a compact mobile account avatar. Its dark navigation panel supports keyboard operation,
Escape dismissal with summary focus, and closes on client navigation. It is a disclosure,
not a modal, so it does not trap focus. The account menu remains accessible on mobile.
No icon package is installed; use clear text navigation rather than introducing one.

Main content uses `min-width: 0`, 16/32px responsive horizontal gutters and a 1440px
maximum inside the stage. The sidebar itself stays flush left. Resource/category
editors are limited to 840px with identity, policy/classification and action sections.
Forms use one column on mobile and two on tablet when practical. Login uses a navy informational panel on the left and the
existing 448px sign-in panel on the right at `lg` and above, as requested by the
product owner. Hide the informational panel on smaller screens. Password change
keeps the compact centered panel. Both retain the shared fonts and control styles.

Resource directories combine heading/count, search/filter controls, results and
pagination into one panel. Counts come from the existing query and explicitly say
"matching filters" when constrained; do not invent active/inactive counts from a
single paginated subset. Categories use separate Resources and Requests columns.
Descriptions may be clamped to two lines because the existing Edit page exposes
the full text; names/codes remain readable. Employee catalogs omit management actions.
Operational status always stays distinct from booking availability. Avoid duplicate
headings, large informational banners and separate decorative statistic cards.

Preserve root, protected-layout and page-local Suspense boundaries with Cache
Components. Synchronous page/layout defaults return fallbacks; their async server
children call `await connection()` before session reads so
Auth.js request-specific randomness cannot run during prerendering. Preserve
these request-time boundaries. Session-dependent UI
must never be placed in a shared `use cache` scope. Pages and actions retain their
independent authorization checks; hiding a menu does not grant or revoke access.
React render-pass memoization deduplicates identity reads within one render only;
new requests and sensitive write transactions retain current-database checks.
See `docs/rendering-performance.md` for rendering and navigation conventions.

## Accessibility and validation

- Target WCAG AA: normal text 4.5:1, large text 3:1, control boundaries/focus 3:1.
  Check actual foreground/background pairs when extending tokens; do not assume
  arbitrary utility combinations inherit accessible contrast.
- Preserve native semantics, one primary heading, logical heading order and tab order.
- Use the shell's skip link, visible focus outlines, scoped table headings, labelled
  scroll regions, explicit button names and native expandable account controls.
- Do not communicate status by color alone. Do not remove focus outlines or rely
  on hover for essential functionality. No unnecessary motion is added.
- Check keyboard operation, 200% zoom, narrow widths and long employee identifiers.
  Automated checks supplement visual/manual testing; they do not prove WCAG compliance.

Run TypeScript, ESLint, existing authentication tests and `npx next build --webpack`.
Report network/font failures separately. Verify actual pages in a browser when
the environment permits. Do not alter real account passwords or production data
solely to get UI screenshots. Keep Prisma models and migrations out of styling tasks.

## Examples

Correct: `<PageHeader title="Resources" description="Manage organizational resources." action={<Button type="button">Create resource</Button>} />`.
Add this only when the actual create flow exists; never ship a decorative inert action.

Correct: `<StatusBadge tone="success">Confirmed</StatusBadge>` or
`<Input id="capacity" type="number" className="tabular-nums" />` with a visible label.

Incorrect: `rounded-2xl shadow-xl bg-gradient-to-r`, glowing primary buttons,
emoji status labels, a different random color per statistic, or unlabeled icon-only
actions. Incorrect: using `text-gray-300` for supporting text on white, removing
focus outlines, or replacing a server guard with a hidden navigation item.

## Initial validation (12 October 2026)

TypeScript, ESLint and the webpack production build passed, including real font
downloads. Existing authentication tests: 33 passed; the dedicated PostgreSQL
test was skipped because no test database URL was supplied. Main text/status pairs
have at least 4.5:1 contrast; input boundaries and focus have at least 3:1.
These calculated checks are not a full accessibility audit.

The built login page was inspected at desktop and 390px mobile widths with no
horizontal overflow; actual computed fonts were Inter and Urbanist. The visibility
toggle worked. Unauthenticated dashboard, employee and password-change requests
redirected to login. Production preview needed an explicit process-only localhost
`AUTH_URL`; the initial preview failed closed with Auth.js `UntrustedHost`.
The trusted preview also exposed Auth.js randomness during prerendering; explicit
`connection()` calls were added to the server pages/layout before session reads.
The final webpack build and trusted-origin preview passed without those warnings.
An intermediate webpack cache hash error was resolved by clearing only the
generated `.next/cache/webpack` directory and rebuilding.
Configure deployment origin/trust correctly before production authentication.
No application authentication settings were changed for this styling task.

Authenticated screens were updated in source but not visually exercised with real
account credentials. Live login/password-change/provisioning end-to-end coverage
is still separate work; no real account or database record was modified. Package
installation reported nine high-severity dependency advisories; dependency security
review remains separate from design changes and no forced upgrades were performed.
