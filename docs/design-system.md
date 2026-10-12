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
| `--secondary` | `#34435B` | Descriptions, labels and navigation |
| `--muted` | `#526277` | Supporting text and placeholders |
| `--control-border` | `#8191A5` | Visible input/button boundaries |
| `--primary-hover` / `--primary-active` | `#066B65` / `#055B56` | Teal interaction states |
| `--on-primary` | `#FFFFFF` | Text on primary/danger buttons |
| `--accent-on-dark` / `--muted-on-dark` | `#5EEAD4` / `#C4D1E2` | Teal accent and supporting text on navy login panel |
| `--focus` | `#087F78` | Focus outline, 2px with 3px offset |
| `--disabled` / `--disabled-foreground` | `#E9EEF3` / `#526277` | Disabled controls |
| `--input` | `#FFFFFF` | Input background |
| `--table-header` | `#EDF1F6` | Column headings and neutral status |
| `--navigation-selected` | `#E5F3F1` | Current navigation background |
| `--success` / `--success-surface` | `#176544` / `#EDF7F0` | Successful outcomes, Active |
| `--warning` / `--warning-surface` | `#78520D` / `#FFF6DF` | Attention or blocked prerequisites |
| `--danger` / `--danger-surface` | `#A22C35` / `#FCEDEE` | Errors and destructive actions |
| `--danger-hover` | `#87232B` | Destructive action hover |
| `--info` / `--info-surface` | `#25588C` / `#EDF4FB` | Informational states |

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
48px. Use 8px label/input gaps, 16–24px field gaps, 24–32px panel padding and 32px
between sections. On mobile use 16px page gutters; at tablet/desktop use 32–48px.
Tiny typographic details and thin borders may fall outside that rhythm.

- Panels, cards, tables and feedback: **0px radius**.
- Inputs, buttons and account controls: **4px maximum**.
- Status badges: **2px maximum**.
- Dialogs: **0–4px**, 1px border. Shadows only if required to distinguish layering.
- Surfaces and tables: thin 1px borders; no default shadows.
- Buttons/inputs: minimum 44px height for usable interaction targets.

## Shared components

Import from `@/components/ui`:

- `Button`: `primary` (default), `secondary`, `danger`. Always set `type` in forms.
  Use primary for the main action, secondary for auxiliary actions. Use the same
  `.button .button-primary` classes on links that navigate rather than submit.
- `Input`: native input props and `.field`. Native selects/textareas use `.field`.
- `FormField`: explicit `id`, visible `label`, optional `hint`, and native children.
  Consumers connect hints with `aria-describedby="<id>-hint"`. It does not infer
  validation errors or clone children; field-specific errors remain explicit.
- `Card`: rectangular section with optional accessible label; padding is supplied
  by the caller. Supply a heading inside it for semantic content structure.
- `PageHeader`: one page title, optional section label, description and action slot.
  The action sits at the upper right on desktop and wraps naturally on mobile.
- `StatusBadge`: `success`, `warning`, `danger`, `info`, `neutral`. Always include
  meaningful visible text; the badge alone is not an ARIA live region.
- `EmptyState`: explain what is absent and what to do next; optional valid action.
- `LoadingState`: a polite status message without decorative animation.
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

## Page and navigation patterns

Authenticated pages reuse `(protected)/layout.tsx`: brand/header, native account
menu, current-section label, role-filtered navigation, and constrained main area.
Account menu contains employee ID, current role, password link and logout. Only
Admins see Employees navigation. Do not expose links to unimplemented resource or
reservation pages; add them when working routes and server authorization exist.
`WorkspaceNavigation` sets `aria-current="page"`, selected fill and border.

The desktop shell spans the full viewport with a 224px navigation column flush
with the left edge; do not center or constrain the shell with an outer max-width.
below the `md` breakpoint navigation becomes a wrapping horizontal region. Main
content uses `min-width: 0`, flexible headers and responsive gutters. Keep the
account menu within viewport bounds. Forms use one column on mobile and two on
tablet when practical. Login uses a navy informational panel on the left and the
existing 448px sign-in panel on the right at `lg` and above, as requested by the
product owner. Hide the informational panel on smaller screens. Password change
keeps the compact centered panel. Both retain the shared fonts and control styles.

Preserve the root Suspense boundary with Cache Components. The affected server
pages and protected layout call `await connection()` before session reads so
Auth.js request-specific randomness cannot run during prerendering. Preserve
these request-time boundaries. Session-dependent UI
must never be placed in a shared `use cache` scope. Pages and actions retain their
independent authorization checks; hiding a menu does not grant or revoke access.

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
