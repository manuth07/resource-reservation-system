# Authentication backend

Uses the installed `next-auth@5.0.0-beta.32` Credentials provider, JWT sessions,
the existing PostgreSQL Prisma client, and Argon2id. There is no Auth.js database
adapter, registration flow, or session table. The auth route explicitly uses the
Node.js runtime; consumers of Prisma/Argon2 must also run on Node.js, not Edge.

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
`src/app/api/auth/[...nextauth]/route.ts` exports GET/POST. No custom login page or
login Server Action has been implemented. Auth.js may render its built-in sign-in
page until a custom login page is configured in the later UI step.

## Credential verification

IDs are trimmed and uppercased, never passwords. A parameterized Prisma
`$queryRaw` SELECT uses `upper("employeeId") = normalizedId` with literal equality
and `LIMIT 2`, not LIKE/ILIKE. Underscores, percent signs, backslashes, and quotes
are ordinary ID characters, and user input is bound separately from SQL text.
This preserves case-insensitive login for legacy mixed-case IDs. Two matching
records cause a generic failure rather than an arbitrary selection. The query
uses the existing unmapped `public.User` table; no schema or indexes are changed.
Future Admin provisioning must reuse `normalizeEmployeeId`
and prevent canonical-ID collisions; the current database's text uniqueness is
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

JWT application claims are only subject/user ID, employee ID, and role. Auth.js
adds its own lifecycle claims. Session responses expose only these three user
fields and expiry; no email, password hash, account status, department, or password
change flag is placed in the token. Client session-update data cannot change claims.
The configured session lifetime is eight hours; claims are identity/display data,
not authoritative permissions.

## Server-side authorization

Import helpers from `@/lib/authorization` in protected Node.js code:

- `getAuthenticatedUser()` verifies the session and loads current ID, employee ID,
  role, department ID, account status, and mustChangePassword from PostgreSQL.
  Returns null for missing/inactive accounts. It is an identity lookup, not a
  normal-access permission check; it can return a password-change-only user.
- `requireAuthenticatedUser()` is the normal-access gate. It additionally rejects
  `mustChangePassword = true` with PASSWORD_CHANGE_REQUIRED.
- `requireRole(...roles)` applies that normal-access gate and checks the current
  database role against the explicit allowlist. Employee-capability handlers
  should include DEPARTMENT_HEAD (and ADMIN where appropriate) in the allowlist;
  role names do not imply a permission hierarchy automatically.
- `requirePasswordChangeUser()` permits only active signed-in users whose flag is
  true. Reserve this bypass for the future first-login password-change operation.
- Logout uses Auth.js and remains available without passing the normal-access gate.

AuthorizationError carries a 401 or 403 and a stable code. Future routes/actions
must translate it into an appropriate response, and pages can redirect after the
server check. These helpers are deliberately uncached across calls so account
deactivation, demotion, transfers, and flag changes are read from PostgreSQL.
For sensitive writes, recheck relevant account/department state within the write
transaction if concurrent administration could change eligibility.

Importing `auth()` alone or merely checking that a session exists does NOT enforce
the mandatory password-change rule. No middleware or existing homepage protection
is added at this stage. Every future protected page, action, API, and service must
call the appropriate guard; UI redirects are not security boundaries. Resource
ownership and the HOD's designated-department relationship must be checked in the
operation-specific logic, not inferred from JWT role/department claims.

## Remaining work

The login UI, password-change operation, provisioning, and secure Admin bootstrap
are intentionally absent. The password-change operation must verify the current
password, validate/hash the new password, and update passwordHash and clear the
flag atomically. Session invalidation after password changes/resets and account
security events (including suspected compromise or deactivation/reactivation)
must be designed before those flows are enabled: stateless JWTs do not
automatically invalidate other sessions. In particular, a session acquired with a
stolen temporary password must not gain normal privileges when another session
clears mustChangePassword. Current database checks reject inactive users, but do
not revoke their tokens or prevent reuse after reactivation. No password hash
belongs in JWTs. This revocation mechanism is not implemented in this task.
Add effective shared SERVER-SIDE login rate limiting/brute-force controls before
production deployment; UI throttling and an in-process limiter do not protect
multiple app instances. This remains unimplemented. Auth.js manages CSRF
for its own endpoints; later custom mutation endpoints need their own appropriate
request protections. No database migrations or account data were changed.

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
unauthenticated sessions, and forged updates to all three identity claims, as well
as the original verification/inactive-account/first-login scenarios.
They do not connect to PostgreSQL or
test browser cookies/end-to-end login. Live integration requires configured local
secrets and an existing provisioned account, without exposing credentials in logs.
