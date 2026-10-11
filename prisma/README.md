# Reservation database design

The schema targets the existing local PostgreSQL database through Prisma ORM 7.
`prisma7.config.ts` continues to load `DATABASE_URL`, and the client generator
continues to output to `src/generated/prisma`. Schema validation does not apply
the schema to the database.

The initial migration is prepared in `migrations/20261012000000_init/migration.sql`
and has not been applied. It contains the complete Prisma-generated schema plus
the PostgreSQL integrity constraints described below.

## Relationships

- A department has many employees and one optional designated head. The named
  `DepartmentMembers` and `DepartmentHead` relations separate membership from
  leadership. Create the department with no head, create its users, then designate
  its head. A user can technically head multiple departments; business validation
  must require the designated head to have the `DEPARTMENT_HEAD` role and belong
  to that department.
- A user requests many reservations and makes many approval decisions. Separate
  named relations identify requester and approver responsibilities.
- A category has many resources and many reservation requests. Every reservation
  records its requested category, even before a resource is assigned.
- A reservation belongs to its requester and submission-time department. It can
  have one assigned resource, one assigned driver, and one decision per approval
  stage. Resources and drivers can each serve many reservations over time.
- A driver is an independently managed record, with no login or user relation.

## Additional fields and assumptions

- Department `code`, category `code`, resource `resourceCode`, employee
  `employeeId`, and driver `driverIdentifier` are unique organizational identifiers.
  Department/category names and user email addresses are also unique. These are
  ordinary PostgreSQL text constraints; normalize emails and codes consistently
  in the future application if case-insensitive uniqueness is required.
- All users, including admins, belong to a department. `AccountStatus` supports
  `ACTIVE` and `INACTIVE`; resource and driver availability uses `isActive`.
  Deactivation retains reservation history.
- `passwordHash` stores an encoded secure password hash, never plaintext. The
  schema cannot enforce hashing, administrator-only registration, permissions,
  or employee capabilities inherited by department heads. Those belong to the
  later authentication and authorization implementation.
- Category `isVehicle` distinguishes transport requests without relying on names
  such as VAN. Vehicle requests always use the approval workflow, regardless of
  an individual resource's `requiresApproval`. For other categories, the selected
  resource's `requiresApproval` chooses the workflow.
- Category `metadata` is optional JSONB for category-specific attributes. Core
  relationships, assignments, workflow state, and destination use typed fields.
- Reservation `departmentId` deliberately records the department at submission.
  It prevents an employee's later transfer from rerouting an existing request.
  The application initializes it from the requester's current department; it
  is not a second source of truth for current user membership.
- The requested category expresses the original request; the assigned resource
  expresses fulfillment. Require the assigned resource to belong to the requested
  category. This cross-model rule is not enforced by the individual foreign keys.
- `ApprovalStage` distinguishes Admin review, department-head approval, and final
  Admin confirmation. An approval row records a completed APPROVED or REJECTED
  decision, not a pending task. `decidedAt` records decision time. Rejection reasons
  are optional. The compound unique constraint permits one decision per stage;
  rejected requests are terminal and any resubmission creates a new reservation.
- Capacity and location are optional because they do not apply to every resource.
  Destination is optional because only transport bookings need it. Driver phone
  is required; driver email is optional and is not treated as an identity.
- Timestamps use PostgreSQL `timestamptz(3)` for unambiguous instants. Additional
  creation/update timestamps on departments, categories, and drivers support
  administration. Prisma supplies UUID defaults and maintains `updatedAt` for
  Prisma writes; future external writers must maintain timestamps themselves.
- Historical foreign keys use `Restrict` to avoid deleting reservation evidence.
  The optional designated-head relation uses `SetNull` when its user is deleted.
  Prefer deactivation to deletion for users, resources, and drivers.

## Booking workflows

### Direct booking

For an active non-vehicle resource with `requiresApproval = false`, verify its
availability and create the reservation with its resource, requested category,
requester's department, and explicit `CONFIRMED` status. No approval rows or driver
are needed. `PENDING` is the schema default for approval requests, so the direct
booking path must explicitly choose `CONFIRMED`.

### Approval-based booking

1. Submission creates a `PENDING` reservation. For a normal resource booking,
   the selected resource can already be recorded.
2. Admin acceptance records an APPROVED `ADMIN_REVIEW` decision and advances the
   reservation to `AWAITING_APPROVAL`.
3. The submission department's designated head records an APPROVED
   `DEPARTMENT_HEAD_APPROVAL` decision and advances it to `APPROVED`.
4. Final Admin confirmation records an APPROVED `ADMIN_CONFIRMATION` decision and
   advances it to `CONFIRMED` after rechecking availability and assignments.

A rejection records the stage and rejecting user, then sets `REJECTED`.
Cancellation sets `CANCELLED`; later application rules must define who may cancel
and at what stages. Each approval decision and matching status change should be
written atomically in one transaction. Workflow order and actor permissions must
be enforced by that application logic.

For vehicle requests, submission records the requested vehicle category and
destination with `resourceId` and `driverId` null. After HOD approval, the Admin
assigns an active available vehicle from that category and an active available
driver before confirmation. Require both assignments for confirmed vehicle
reservations and reject driver assignments for non-vehicle bookings.

`COMPLETED` is never persisted. Display it when `status == CONFIRMED` and
`endTime < now`; otherwise display the stored status.

## Database integrity and availability

The indexes support date searches, status queues, department approval queues,
requester history, category requests, and resource/driver availability. Indexes
do not prevent conflicting reservations or enforce workflow transitions.

Only the persisted `CONFIRMED` status consumes resource and driver availability.
`PENDING`, `AWAITING_APPROVAL`, `APPROVED`, `REJECTED`, and `CANCELLED` never place
holds, even when resource or driver IDs have already been assigned. Approval
alone does not guarantee allocation. Direct booking and final Admin confirmation
must check current availability; the database constraints are the final guard
against concurrent confirmations. Completed bookings retain `CONFIRMED` and
their historical interval, but do not overlap future bookings.

Use half-open time intervals `[startTime, endTime)` so back-to-back bookings are
allowed. An existing confirmed interval overlaps a requested interval when
`existing.startTime < requested.endTime` and
`existing.endTime > requested.startTime`.

The initial migration adds these named constraints:

| Constraint | Guarantee |
| --- | --- |
| `Reservation_valid_time_interval_check` | `endTime > startTime`; no zero or negative duration. |
| `Reservation_confirmed_resource_check` | `CONFIRMED` requires a non-null resource; other statuses still permit null. |
| `Resource_positive_capacity_check` | The nullable integer capacity is null or greater than zero. |
| `Reservation_confirmed_resource_no_overlap` | No overlapping confirmed reservations for the same non-null resource UUID. |
| `Reservation_confirmed_driver_no_overlap` | No overlapping confirmed reservations for the same non-null driver UUID. |

The exclusions use GiST with UUID equality and
`tstzrange("startTime", "endTime", '[)')` overlap (`&&`). The migration installs
`btree_gist` for UUID equality support. Constraints apply to inserts and updates,
including confirmation, rescheduling, and reassignment. They are immediate:
assign the resource and change status together in one update, or assign first and
confirm afterward within one transaction. Driver assignment remains optional at
database level because vehicle classification is stored in another table.

Availability prechecks provide a helpful response but cannot prevent races alone.
The exclusion constraints arbitrate concurrent writes. The future backend should
roll back the complete confirmation/approval transaction on a constraint failure
and return an allocation conflict. PostgreSQL exclusion violations use SQLSTATE
`23P01`; CHECK violations use `23514`. Do not assume Prisma maps an exclusion
violation to a uniqueness error (`P2002`); inspect/test adapter error handling.

Application logic still owns secure hashing and permissions, account/resource/
driver active status, requested-category matching, submission-department routing,
HOD eligibility, stage ordering, rejection/cancellation policies, required driver
for confirmed vehicle bookings, and prohibition of drivers on non-vehicle bookings.
Validate positive capacity and time intervals in the backend too for clear errors.
Preserve history by disabling hard deletion and treating approval decisions as
immutable. Database constraints do not replace these business rules.

## Initial migration and Prisma caveats

The SQL was generated offline with Prisma 7.10.0, without a datasource or shadow
database connection:

```sh
node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema prisma/schema.prisma --script --config prisma7.config.ts --output prisma/migrations/20261012000000_init/migration.sql
```

The generated SQL creates the five enums, seven tables, all existing indexes and
foreign keys before the custom constraints. There are no `@map` or `@@map`
directives; the emitted names are quoted model/field names. UUIDs, TIMESTAMPTZ(3),
nullable assignments, and nullable INTEGER capacity are preserved. Prisma's
`uuid()` default remains client-side, so raw SQL inserts must supply UUIDs.
The customized migration wraps creation and constraint installation in a single
transaction. `migration_lock.toml` records the PostgreSQL provider.

This is a first migration for a clean target schema, not an idempotent SQL file to
run repeatedly. Prisma Migrate tracks it and applies it once per database. It does
not baseline pre-existing application tables. If the target already contains these
tables, stop and review baselining rather than running this initial migration.

The database must have the `btree_gist` extension package available. PostgreSQL 18
marks it trusted; the applying role needs CREATE privilege on the database and
suitable public-schema privileges. Future development shadow databases also need
the extension available and installation permissions to replay migration history.

CHECK and exclusion constraints cannot be fully represented in this Prisma schema.
Keep their SQL in migration history, including when replaying into a shadow or
clean database. Introspection may warn about unsupported constraints and cannot
reproduce them as complete Prisma model definitions. A schema-only diff/validate
can pass while these custom guarantees are missing. Do not regenerate this initial
migration from `schema.prisma` and overwrite its custom tail. Review future diffs
and migrations affecting status, UUID assignments, or time columns, especially
any table/index recreation, to preserve the custom constraints. Do not use
`db push` as a substitute for applying the reviewed migration history.

After approval, from the project root with `DATABASE_URL` targeting the intended
local `resource_reservation_db`, apply and verify:

```sh
node node_modules/prisma/build/index.js validate --config prisma7.config.ts
node node_modules/prisma/build/index.js migrate deploy --config prisma7.config.ts
node node_modules/prisma/build/index.js migrate status --config prisma7.config.ts
node node_modules/prisma/build/index.js db execute --file prisma/verify-integrity.sql --config prisma7.config.ts
node node_modules/prisma/build/index.js generate --config prisma7.config.ts
```

`verify-integrity.sql` only reads PostgreSQL catalogs: it fails if any of the five
custom constraints are missing/unvalidated or the exclusion indexes are invalid.
It also provides a definitions query for psql/SQL-client inspection; Prisma's
`db execute` does not print result rows. This verifies installation, not behavior.
Later, on a dedicated disposable test database, test equal/reversed times,
zero/negative/null capacity, confirmation without a resource, resource and driver
overlaps, adjacent bookings, every non-confirmed status, updates into CONFIRMED,
and two simultaneous confirmations. No database execution or behavioral tests
have been performed during preparation.

PostgreSQL reference: https://www.postgresql.org/docs/18/rangetypes.html#RANGETYPES-CONSTRAINT

## Local schema checks

The installed Prisma 7.10.0 recognizes `prisma7.config.ts` automatically. Pass it
explicitly in documented commands for clarity:

```sh
node node_modules/prisma/build/index.js format --config prisma7.config.ts
node node_modules/prisma/build/index.js validate --config prisma7.config.ts
```
