# Authentication backend

Uses the installed `next-auth@5.0.0-beta.32` Credentials provider, JWT sessions,
the existing PostgreSQL Prisma client, and Argon2id. There is no Auth.js database
adapter, public registration flow, or session table. The app uses Next.js's default
Node.js runtime. With the installed Next.js 16.4 Cache Components configuration,
segment `runtime`/`dynamic` exports are unsupported. Request-time authenticated
content is behind the root Suspense boundary and is never put in `use cache`.
Prisma/Argon2 code must not be moved to Edge or shared/public caches.

## Configuration

Copy the placeholders in `.env.example` into an ignored local environment file.
Set `DATABASE_URL` and a cryptographically random `AUTH_SECRET` of at least 32
bytes, encoded as base64. The module rejects missing, empty, short, and
whitespace-only secrets without trimming or otherwise changing an accepted value.
Length alone cannot prove entropy. Keep the secret stable across app instances and never
prefix either variable with `NEXT_PUBLIC_`. Do not commit or log real secrets.
Auth.js handles encrypted JWT cookies, validation, expiry, CSRF protection, and
logout; the app does not override cookie or cryptographic implementations. Use
HTTPS in production and configure the deployment's trusted origin/proxy correctly.

`src/auth.ts` exports Auth.js `auth`, `signIn`, `signOut`, and `handlers`.
`src/app/api/auth/[...nextauth]/route.ts` exports GET/POST. Login and password-change
flows use Server Actions. The custom `/login` page is configured as Auth.js's
sign-in/error destination. `/change-password` accepts only an active, current-version
authenticated user. `/dashboard` and `/admin/employees` are protected on the server.

## Credential verification

IDs are trimmed and uppercased, never passwords. A parameterized Prisma
`$queryRaw` SELECT uses `upper("employeeId") = normalizedId` with literal equality
and `LIMIT 2`, not LIKE/ILIKE. Underscores, percent signs, backslashes, and quotes
are ordinary ID characters, and user input is bound separately from SQL text.
This preserves case-insensitive login for legacy mixed-case IDs. Two matching
records cause a generic failure rather than an arbitrary selection. The query
uses the existing unmapped `public.User` table; no schema or indexes are changed.
Admin provisioning reuses `normalizeEmployeeId`
and prevents canonical-ID collisions; the current database's text uniqueness is
case-sensitive. Input types and bounds (128 ID characters, 1024 password
characters) are checked server-side.

Only ACTIVE accounts with valid Argon2id hashes authenticate. Missing users,
inactive accounts, incorrect passwords, ambiguous IDs, and invalid digests all
return null, yielding Auth.js's generic CredentialsSignin failure. A public dummy
Argon2id digest is verified for nonexistent/ambiguous users and unusable hashes
to reduce account enumeration through timing. This is mitigation, not a guarantee
of identical timing, especially with different historical hashing parameters.
Expected failures do not log identifiers, passwords, or hashes. Unexpected Auth.js
errors log only an error type, never the callback cause or credential payload.

JWT application claims are subject/user ID, employee ID, role, and sessionVersion. Auth.js
adds its own lifecycle claims. Session responses expose only those four user
fields and expiry; no email, password hash, account status, department, or password
change flag is placed in the token. Client session-update data cannot change claims.
The configured session lifetime is eight hours; claims are identity/display data,
not authoritative permissions.

## Server-side authorization

Import helpers from `@/lib/authorization` in protected Node.js code:

- `getAuthenticatedUser()` verifies the session and loads current ID, employee ID,
  role, department ID, account status, mustChangePassword and sessionVersion from PostgreSQL.
  Returns null for missing/inactive accounts, tokens missing a valid version, or
  versions differing from PostgreSQL. It is an identity lookup, not a
  normal-access permission check; it can return a password-change-only user.
- `requireAuthenticatedUser()` is the normal-access gate. It additionally rejects
  `mustChangePassword = true` with PASSWORD_CHANGE_REQUIRED.
- `requireRole(...roles)` applies that normal-access gate and checks the current
  database role against the explicit allowlist. Employee-capability handlers
  should include DEPARTMENT_HEAD (and ADMIN where appropriate) in the allowlist;
  role names do not imply a permission hierarchy automatically.
- `requirePasswordChangeUser()` permits only active signed-in users whose flag is
  true. The implemented own-password-change service allows both mandatory changes
  and voluntary changes, using current identity plus a transaction-time version/status check.
- Logout uses Auth.js and remains available without passing the normal-access gate.

AuthorizationError carries a 401 or 403 and a stable code. Future routes/actions
must translate it into an appropriate response, and pages can redirect after the
server check. These helpers are deliberately uncached across calls so account
deactivation, demotion, transfers, and flag changes are read from PostgreSQL.
For sensitive writes, recheck relevant account/department state within the write
transaction if concurrent administration could change eligibility.

Importing `auth()` alone or merely checking that a session exists does NOT enforce
the mandatory password-change or current-version rules. The homepage redirects to
the protected dashboard. Layout AND page checks protect reads; mutation services
independently guard every Server Action. Every future protected page, action, API, and service must
call the appropriate guard; UI redirects are not security boundaries. Resource
ownership and the HOD's designated-department relationship must be checked in the
operation-specific logic, not inferred from JWT role/department claims.

## Password changes, provisioning and abuse controls

The password-change service verifies the current Argon2id hash, requires a new
12–128-character password with a letter and number, rejects reuse and mismatched
confirmation, and atomically updates the hash, clears mustChangePassword, and
increments sessionVersion. A conditional update checks the old hash, version and
active status, so racing changes cannot both succeed. The action signs out and
requires fresh login. No token version is silently refreshed. Old sessions fail
current database authorization, even after another session clears the initial flag.
Tokens issued before version claims were introduced are rejected. Logout stays
available for revoked/first-login sessions.

Admin-only `/admin/employees` creates EMPLOYEE or DEPARTMENT_HEAD accounts. IDs use
2–64 ASCII letters/digits/hyphens/underscores, beginning with a letter/digit; email
and ID are canonicalized. A transaction-scoped advisory lock serializes all app
provisioning/resets, followed by literal case-insensitive duplicate checks. The
Admin is rechecked under a row lock. HOD creation locks the department, rejects an
occupied head position, and assigns the newly created head to their own department
atomically. A new account has an Argon2id temporary password hash, ACTIVE status,
mustChangePassword=true, and sessionVersion=0. There is no public registration or
UI for creating Admins. Department administration remains outside this module.

The same interface resets employee/HOD credentials, forcing another password
change and atomically incrementing the version. It cannot reset an Admin here.
Temporary passwords use the shared cryptographic helper also used by bootstrap.
They are returned only after commit, shown in client memory to the authorized
Admin, dismissible, and never stored as plaintext or sent back as previous-action
state. Browsers/operators can copy the displayed value; this is one-time delivery,
not a guarantee against screenshots or browser inspection. Do not record the output.

Future account deactivation/reactivation or suspected-compromise operations must
also increment sessionVersion atomically. Those account-status management flows
are not implemented. External SQL writers must preserve canonical uniqueness and
revocation rules; existing case-sensitive uniqueness does not enforce them alone.

Login limits are 30 requests/minute per source and 5 per normalized ID/15 minutes.
Password changes allow 5 attempts/user/15 minutes; provisioning allows 20/Admin/hour;
resets allow 10/Admin/hour. Local-only bounded counters are permitted outside
production/Vercel. Production AND Vercel require RATE_LIMIT_REDIS_REST_URL and
RATE_LIMIT_REDIS_REST_TOKEN for an HTTPS Upstash-compatible endpoint with EVAL,
INCR and PEXPIRE permissions. Counter increment and expiry use one atomic Lua script.
Missing/partial configuration, errors or timeouts FAIL CLOSED; there is no production
in-memory fallback. This is an enforced deployment blocker until shared storage is
configured and tested. Keys hash IDs/IPs; passwords are never included.
On Vercel only the platform x-vercel-forwarded-for header is trusted; elsewhere a
conservative shared source bucket prevents caller-spoofed header bypass. Attackers
can still exhaust account attempt quotas; operational monitoring is needed.

Auth.js manages CSRF for its endpoints; Server Actions use Next.js origin checks
AND independent service authorization. Redirect destinations are fixed, not supplied
by the client. Future custom mutation APIs must apply equivalent request protections
and current-user/role guards, translating AuthorizationError to 401/403 responses.
No applied migrations or application database records were changed during this work.

## Initial administrator bootstrap

After explicit approval, with reviewed migrations already applied, the generated
Prisma client present, and DATABASE_URL set in an ignored `.env` file, run in a
private interactive terminal from the project root:

```sh
npm run admin:bootstrap -- --name "<administrator name>" --email "<organizational email>"
```

Replace both placeholders. `--help` displays usage without loading the database
client. There is no HTTP bootstrap endpoint. The npm command uses the existing
Jiti TypeScript loader (also used by Prisma, declared directly as a development
dependency) and `--conditions=react-server` so the existing server-only
Prisma singleton can be used outside Next.js. The standalone `server-only` package
is installed for that CLI import. Jiti does not propagate Node's react-server
condition, so the private CLI launcher explicitly selects the marker's empty
server export; ordinary Next.js client-import protections remain unchanged.
Next.js/Prisma configuration, schema, and migration history are unchanged.

The command reserves the canonical employee ID `ADMIN001`. It rejects any existing
ADMIN, including inactive accounts; it never updates, promotes, or resets an account.
It also rejects case-insensitive collisions with that ID. It creates or reuses the
exact Administration department (`code = ADMINISTRATION`, `name = Administration`),
rejecting name/code conflicts rather than silently repurposing a department.
Existing email uniqueness is enforced by PostgreSQL. The Admin belongs to this
department and is not designated as its HOD.

The temporary password uses 32 bytes from Node.js `crypto.randomBytes` (256 bits),
encoded as base64url. Only its Argon2id hash enters PostgreSQL. The account is
ACTIVE, ADMIN, and mustChangePassword=true. Department and user creation are atomic.
Within the transaction, a fixed PostgreSQL transaction-scoped advisory lock is
acquired BEFORE checking for an Admin. ReadCommitted means a second bootstrap
invocation sees the preceding commit and refuses creation. The unique ADMIN001
identifier is an additional conflict guard. The lock coordinates this CLI, not
arbitrary outside database writers; do not run separate administrative provisioning
or manual role changes concurrently with initialization. Lock/transaction failures
abort safely; the script does not retry or silently replace an existing Admin.

The CLI refuses redirected/non-interactive stdin/stdout. It writes the temporary
password once only AFTER successful transaction commit, then disconnects. This is
intentional secret delivery to the authorized operator, not application logging.
Do not pipe output, capture terminal transcripts, execute in recorded CI sessions,
commit the output, or save it to shared logs. TTY checks cannot detect screen
recording or terminal history capture. No password is stored in source, env files,
seed scripts, or recovery files. Database errors expose neither connection strings
nor raw error details. If commit succeeds but terminal output is lost, a repeat run
will refuse; use a separately reviewed manual recovery process rather than deleting
accounts or weakening these checks. Missing/invalid inputs are rejected without
creation. All ADMIN001 bootstrap instances target the same configured database.

The Admin signs in at `/login`, changes the temporary password at `/change-password`,
then signs in again to manage employees. Bootstrap tests mock PostgreSQL:
rollback and concurrent execution are simulations, not database integration proof.
The existing ADMIN001 account was provisioned before this work. The bootstrap
command was not rerun, and its credentials were not changed during validation.

```sh
node --test tests/admin-bootstrap.test.mjs
```

## Checks

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/auth.ts src/lib/credentials.ts src/lib/authorization.ts src/types/next-auth.d.ts "src/app/api/auth/[...nextauth]/route.ts" tests/auth-backend.test.mjs
node --test tests/auth-backend.test.mjs
```

Tests exercise real credential/hash verification and the actual callbacks/guards
with mocked database/framework boundaries. They assert the parameterized literal
equality SQL and simulate case-insensitive equality; they do not execute SQL.
They cover literal special-character IDs, case collisions, invalid secrets,
unauthenticated sessions, and forged updates to identity and captured version, as well
as password changes, version revocation, Admin provisioning, HOD consistency, resets,
and limiter failure modes. Redis tests mock the REST endpoint; they do not prove
live Upstash connectivity or deployment IP trust configuration.
The unit tests do not connect to PostgreSQL or
test browser cookies/end-to-end login. Live integration requires configured local
secrets and an existing provisioned account, without exposing credentials in logs.

Run all checks:

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src scripts/lib/admin-bootstrap.ts tests --ignore-pattern "src/generated/**"
node --test tests/auth-backend.test.mjs tests/admin-bootstrap.test.mjs tests/account-security.test.mjs tests/rate-limit.test.mjs tests/authentication.integration.test.mjs
npm run build
```

The optional PostgreSQL test requires an explicitly exported TEST_DATABASE_URL to
a dedicated database ending in `_test`, distinct from the application database.
Apply the reviewed migration history to that database privately first. The test
creates isolated fixtures and exercises real service SQL inside one transaction
that is always rolled back; it never changes ADMIN001. Without the variable it is
skipped, not claimed as passed integration coverage. Sensitive failures are sanitized.

## Validation blockers in this workspace

TypeScript and ESLint passed. The combined suite has 33 passing tests and one
skipped dedicated-PostgreSQL integration test. No TEST_DATABASE_URL or Redis REST
configuration was supplied, so real database concurrency and shared-limiter
behavior have not been verified.

The local AUTH_SECRET was not configured; real login requires a secure persistent
secret in an ignored local environment file. No real secret was written or printed.
The normal npm build command failed in the configured Git Bash/MSYS subprocess
environment. Invoking Next directly reached Turbopack but failed starting the CSS
worker for globals.css. A temporary process-only secret did not resolve this
tooling failure. The public preview could not subsequently be reached, so browser
layout, cookies, Server Actions, and the complete ADMIN001 flow remain unverified.
No account credentials or application records were altered to work around this.

Before deployment, configure the secret and shared Redis limiter, resolve the
local build/preview issue, rerun the production build, run the dedicated database
test, and verify login, mandatory password change, relogin, provisioning, and
revocation in a private test environment. REST configuration follows the
[Upstash REST API](https://upstash.com/docs/redis/features/restapi); proxy identity
handling follows [Vercel request headers](https://vercel.com/docs/headers/request-headers).
