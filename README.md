# PrimeWave — Resource Reservation Management System

> Internal organizational resource reservation application built as a software engineering internship technical assessment.

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.0-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.3.0-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma 7](https://img.shields.io/badge/Prisma-7.10.0-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-336791?logo=postgresql)](https://www.postgresql.org/)
[![Auth.js](https://img.shields.io/badge/Auth.js-v5_beta-purple)](https://authjs.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)

---

## 1. Project Overview

PrimeWave Resource Reservation Management System is an enterprise resource management platform designed for internal organizational operations. It streamlines the allocation, scheduling, and governance of conference rooms, equipment, and vehicle transport fleets.

The application enforces organizational governance through:
- **Direct Resource Reservations**: Immediate self-service booking for standard resources requiring no managerial sign-off.
- **Multi-Stage Approval Workflows**: Two-tier governance (Administrative Review followed by Department Head Approval) for high-demand or restricted facilities.
- **Department Head (HOD) Routing**: Dynamic routing of reservation requests based on the requester's organizational department.
- **Category-Based Transport & Driver Allocation**: Employees request vehicle *categories* (e.g., Van, SUV, Sedan) rather than specific vehicles. Following administrative and departmental approvals, Administrators atomically assign both an active vehicle and an available driver.
- **Mathematical Conflict Prevention**: Real-time validation reinforced by PostgreSQL GiST exclusion constraints (`btree_gist` and `tstzrange`), guaranteeing zero overlapping confirmed reservations at the database level.
- **Strict Role-Based Access Control (RBAC)**: Authorization boundaries partitioned across Administrators, Department Heads, and Employees.

---

## 2. Core Features

### Authentication and Access Control
- **Employee ID / Password Authentication**: Sign-in via unique organizational employee IDs (case-insensitive matching) and Argon2id password verification.
- **Administrator-Provisioned Accounts**: No public self-registration. All user accounts are provisioned and administered by authorized personnel.
- **Role-Based Access Control (RBAC)**: Three distinct roles (`EMPLOYEE`, `DEPARTMENT_HEAD`, `ADMIN`) with server-side session guards.
- **Mandatory First-Login Password Change**: Flagged accounts (`mustChangePassword: true`) are strictly restricted to password update endpoints until credentials are reset.
- **Account State & Session Invalidation**: Account deactivation (`accountStatus: INACTIVE`) or session revocation increments `sessionVersion`, immediately terminating active JWT sessions.

### Organization Management
- **Department Directory**: Hierarchical department management with unique department codes and names.
- **Designated Department Heads (HOD)**: Departmental assignment paired with HOD designation governing request approval queues.
- **Employee Directory**: User management, contact records, and organizational transfer controls preserving historical audit logs.

### Resource Management
- **Resource Categorization**: Flexible classifications across Rooms, Equipment, and Vehicles with custom metadata.
- **Resource Lifecycle**: Activation and deactivation toggles that preserve historical reservations.
- **Capacity & Location Specifications**: Enforced positive integer capacities and facility location tracking.
- **Object Storage for Media**: Secure photograph uploads powered by Vercel Blob with client-side direct tokenized uploads.

### Reservations & Scheduling
- **Self-Service Direct Bookings**: Instant confirmation for resources configured with `requiresApproval = false`.
- **Approval Queue**: Managed lifecycle for approval-required assets (`PENDING` $\rightarrow$ `AWAITING_APPROVAL` $\rightarrow$ `APPROVED` $\rightarrow$ `CONFIRMED`).
- **Conflict Avoidance**: Granular availability checks supporting adjacent reservations (`[)` half-open intervals).
- **Safe Cancellation Flow**: Immediate cancellation of upcoming bookings releasing fleet and room availability while retaining complete audit history.
- **Audit Trails**: Full timeline recording timestamps, actor identities, decisions, and administrative remarks.

### Vehicle Fleet & Transport
- **Category-Based Vehicle Requests**: Requesters specify vehicle category, passenger count, destination, and purpose without directly booking individual vehicles.
- **Atomic Vehicle & Driver Allocation**: Administrators assign both an active vehicle (meeting category and passenger capacity requirements) and an available driver in a single atomic database transaction.
- **Driver Roster & Availability**: Directory tracking driver identifiers, license details, contact information, and availability schedules.

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.4.0` | React Server Components, Server Actions, Partial Prerendering, Turbopack |
| **UI Library** | React | `19.3.0` | UI component primitives and server-rendered views |
| **Language** | TypeScript | `^5.0.0` | End-to-end type safety and schema validation |
| **Database** | PostgreSQL | `16+` / `18` | Relational storage, GiST exclusion constraints, and transactional consistency |
| **ORM** | Prisma ORM | `^7.10.0` | Type-safe queries, migration engine, and PostgreSQL driver adapter |
| **Database Adapter** | `@prisma/adapter-pg` / `pg` | `^7.10.0` / `^8.23.1` | Native connection pool and low-level driver adapter |
| **Authentication** | Auth.js (NextAuth) | `^5.0.0-beta.32` | Stateless encrypted JWT session cookies, CSRF protection |
| **Cryptography** | Argon2 | `^0.45.1` | Argon2id password hashing and constant-time comparison |
| **Object Storage** | `@vercel/blob` | `^2.8.1` | Cloud object storage for resource photographs |
| **Styling** | Tailwind CSS | `^4.0.0` | Utility CSS, design tokens, and responsive layout styling |
| **Test Runner** | Node.js Test Runner | Native (`node:test`) | Unit, concurrency, and integration testing harness |

---

## 4. System Architecture

The application implements a clean server-first architecture utilizing Next.js Server Components and Server Actions:

```
[ Browser Client ]
        │
        ▼ (HTTPS / Form Data)
[ Next.js App Router (UI / Server Actions) ]
        │
        ├──▶ Authorization & Role Guards (`src/lib/authorization.ts`)
        ├──▶ Rate Limiting (`src/lib/rate-limit.ts`)
        │
        ▼ (Domain Services)
[ Server-Only Domain Services (`src/lib/*-service.ts`) ]
        │
        ├──▶ Vercel Blob Object Storage (`@vercel/blob`) ──▶ Photograph Files
        │
        ▼ (Type-Safe Query / Interactive Transaction)
[ Prisma 7 Client + pg Driver Adapter (`src/lib/prisma.ts`) ]
        │
        ▼ (SQL / GiST Multicolumn Exclusions)
[ PostgreSQL Database (Public Schema) ]
```

### Layer Responsibilities
1. **Presentation (`src/app`, `src/components`)**: Renders semantic HTML, accessible forms, enterprise navigation, and interactive modal dialogs.
2. **Server Actions (`src/app/*-actions.ts`)**: Accepts form inputs, validates fields, enforces authentication via session cookies, and handles error states.
3. **Domain Services (`src/lib/*-service.ts`)**: Encapsulates core business rules (conflict checking, approval state machine transitions, allocation validations).
4. **Data Access (`src/lib/prisma.ts`, `prisma/schema.prisma`)**: Coordinates database interactions via Prisma Client over connection pools with PostgreSQL.
5. **Storage (`src/lib/storage-service.ts`)**: Direct upload token issuance and metadata association for binary media assets.

---

## 5. Database Design

The relational schema consists of seven principal entities:

```mermaid
erDiagram
    Department ||--o{ User : "members"
    Department ||--o| User : "headed by"
    Department ||--o{ Reservation : "allocated to"
    User ||--o{ Reservation : "requests"
    User ||--o{ Approval : "approves/rejects"
    ResourceCategory ||--o{ Resource : "contains"
    ResourceCategory ||--o{ Reservation : "requested in"
    Resource ||--o{ Reservation : "assigned to"
    Driver ||--o{ Reservation : "assigned to"
    Reservation ||--o{ Approval : "evaluated by"

    Department {
        uuid id PK
        string name UK
        string code UK
        uuid headId FK
    }

    User {
        uuid id PK
        string employeeId UK
        string email UK
        string passwordHash
        boolean mustChangePassword
        int sessionVersion
        enum role
        enum accountStatus
        uuid departmentId FK
    }

    ResourceCategory {
        uuid id PK
        string name UK
        string code UK
        boolean isVehicle
    }

    Resource {
        uuid id PK
        string resourceCode UK
        string name
        uuid categoryId FK
        int capacity
        boolean isActive
        boolean requiresApproval
        string imageUrl
    }

    Driver {
        uuid id PK
        string driverIdentifier UK
        string name
        string phone
        string email
        boolean isActive
    }

    Reservation {
        uuid id PK
        uuid requesterId FK
        uuid departmentId FK
        uuid requestedCategoryId FK
        uuid resourceId FK
        uuid driverId FK
        timestamptz startTime
        timestamptz endTime
        enum status
        int passengerCount
        string destination
        string purpose
    }

    Approval {
        uuid id PK
        uuid reservationId FK
        uuid approverId FK
        enum stage
        enum decision
        string rejectionReason
        timestamptz decidedAt
    }
```

### Concurrency Guarantees & Integrity Constraints
PostgreSQL GiST exclusion constraints (`btree_gist` extension) guarantee scheduling integrity:
- **Resource Overlap Exclusion**:
  ```sql
  ALTER TABLE "Reservation"
      ADD CONSTRAINT "Reservation_confirmed_resource_no_overlap"
      EXCLUDE USING gist (
          "resourceId" WITH =,
          tstzrange("startTime", "endTime", '[)') WITH &&
      )
      WHERE ("status" = 'CONFIRMED' AND "resourceId" IS NOT NULL);
  ```
- **Driver Overlap Exclusion**:
  ```sql
  ALTER TABLE "Reservation"
      ADD CONSTRAINT "Reservation_confirmed_driver_no_overlap"
      EXCLUDE USING gist (
          "driverId" WITH =,
          tstzrange("startTime", "endTime", '[)') WITH &&
      )
      WHERE ("status" = 'CONFIRMED' AND "driverId" IS NOT NULL);
  ```
- **Time Window Validation**: Enforces `endTime > startTime` via CHECK constraints.
- **Capacity & Passenger Bounds**: Positive integer constraints on `Resource.capacity` and `Reservation.passengerCount`.

### Timezone & Timestamp Handling
- All scheduling operations are interpreted in **`Asia/Colombo` (UTC+05:30)**.
- Stored internally in PostgreSQL as absolute **`TIMESTAMPTZ(3)`** (UTC), preserving temporal accuracy across leap years and day boundaries.

---

## 6. Prerequisites

Ensure your host environment meets the following minimum requirements:
- **Node.js**: `v20.9.0` or higher (`v22.x` recommended; tested on `v22.23.3`).
- **npm**: `v10.x` or higher.
- **PostgreSQL**: `v16` or higher (`v18` verified) with superuser privileges or permission to install extensions (`btree_gist`).
- **Git**: `v2.x`.

---

## 7. Getting Started (Fresh Clone Setup)

Follow these steps to set up and run the application locally from a fresh clone.

### Step 1: Clone the Repository
```bash
git clone https://github.com/manuth07/resource-reservation-system.git
cd resource-reservation-system
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the template to create your local `.env` file:

**macOS / Linux:**
```bash
cp .env.example .env
```

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env
```

Generate an `AUTH_SECRET` (at least 32 random bytes):
```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Open `.env` and set `DATABASE_URL` and `AUTH_SECRET`. For example:
```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/resource_reservation_db?schema=public"
AUTH_SECRET="your_generated_secret_here"
```

### Step 4: Create the PostgreSQL Database
Connect to your local PostgreSQL instance and create an empty database:
```sql
CREATE DATABASE resource_reservation_db;
```

### Step 5: Generate Prisma Client
Generate the type-safe Prisma client using the Prisma 7 configuration:
```bash
npx prisma generate --config prisma7.config.ts
```

### Step 6: Apply Database Migrations
Deploy all versioned migrations (including custom GiST constraints and extensions):
```bash
npx prisma migrate deploy --config prisma7.config.ts
```

### Step 7: Bootstrap the Initial Administrator Account
Run the interactive CLI bootstrap tool to create the primary administrator:
```bash
npm run admin:bootstrap -- --name "System Administrator" --email "admin@primewave.local"
```

> [!IMPORTANT]
> This command prints a single-use temporary password:
> ```text
> Administrator created: ADMIN001
> Temporary password (shown once): <temporary_password>
> ```
> Store this password securely to complete your initial login.

### Step 8: Start the Development Server
```bash
npm run dev
```

### Step 9: Log In and Complete Password Change
1. Navigate to **`http://localhost:3000/login`**.
2. Sign in using Employee ID `ADMIN001` and your temporary password.
3. You will be automatically redirected to `/change-password` to establish a permanent password.

---

## 8. Environment Variables

| Variable | Description | Required | Default / Example | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URL with public schema | **Yes** | `postgresql://user:pass@localhost:5432/resource_reservation_db?schema=public` | Server-only; must never be committed. |
| `AUTH_SECRET` | 32+ byte cryptographic secret for JWT signing | **Yes** | Base64-encoded string | Generate with `crypto.randomBytes(32)`. |
| `RATE_LIMIT_REDIS_REST_URL` | Upstash Redis REST endpoint for distributed rate limiting | **Production only** | `https://your-upstash-instance.upstash.io` | Required in production/Vercel. Dev uses memory map fallback. |
| `RATE_LIMIT_REDIS_REST_TOKEN` | Bearer token for Upstash Redis REST endpoint | **Production only** | `AX...` | Server-only. If omitted on production, mutations fail closed. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token for photo uploads | **Optional** | `vercel_blob_rw_...` | If omitted, resource image uploads return HTTP 503 gracefully. |
| `TEST_DATABASE_URL` | Isolated test database for PostgreSQL integration suites | **Optional** | `postgresql://user:pass@localhost:5432/resource_reservation_test` | Must end in `_test`. If omitted, integration tests are skipped. |

---

## 9. User Guides by Role

### 1. Employee (`EMPLOYEE`)
- **Browse Resources**: Visit `Resource Catalog` to filter available meeting rooms, equipment, and transport options.
- **Direct Bookings**: Schedule an instant reservation for resources that do not require approval.
- **Transport Requests**: Submit a category-based transport request via `Request Transport`, specifying vehicle category, passenger count, date, destination, and purpose.
- **Track Status**: Monitor personal requests under `My Reservations`. Cancel upcoming bookings if plans change.

### 2. Department Head (`DEPARTMENT_HEAD`)
- **Departmental Review**: Access the `Approval Queue` under the `Department` navigation section.
- **Assess Requests**: Review pending requests submitted by members of your designated department.
- **Approve or Reject**: Approve requests to advance them to the Administrator queue, or reject them with mandatory explanatory feedback.
- *Note*: An employee designated as an HOD must hold the `DEPARTMENT_HEAD` role and be assigned as `headId` for that specific department.

### 3. Administrator (`ADMIN`)
- **Organization Governance**: Manage departments (`/admin/departments`) and employee profiles (`/admin/employees`).
- **Resource Management**: Create, edit, and deactivate resource categories (`/admin/resource-categories`) and resources (`/admin/resources`).
- **Fleet & Driver Roster**: Add and manage fleet drivers (`/admin/drivers`).
- **Reservation Approvals & Fleet Allocation**:
  - Review preliminary requests in the Admin queue (`/admin/reservations`).
  - Upon departmental approval of transport requests, allocate an active vehicle and driver atomically via `Allocate vehicle and driver`.

---

## 10. Reservation Workflows

### Standard Resource Lifecycle
```
[ Employee Submission ]
        │
        ├── requiresApproval == false ──▶ [ CONFIRMED ] (Immediate availability lock)
        │
        └── requiresApproval == true  ──▶ [ PENDING ]
                                                │
                                                ▼ (Admin Review)
                                          [ AWAITING_APPROVAL ]
                                                │
                                                ▼ (HOD Approval)
                                          [ APPROVED ]
                                                │
                                                ▼ (Admin Confirmation)
                                          [ CONFIRMED ]
```

### Transport Request Lifecycle
```
[ Employee Submits Vehicle Category Request ]
        │
        ▼ (resourceId = NULL, driverId = NULL)
  [ PENDING ]
        │
        ▼ (Admin Reviews Request)
  [ AWAITING_APPROVAL ]
        │
        ▼ (Department Head Approves)
  [ APPROVED ]
        │
        ▼ (Admin Allocates Vehicle & Driver in 1 Transaction)
  [ CONFIRMED ] (resourceId & driverId Assigned; Availability Locked)
```

- **Availability Rule**: Only reservations in `CONFIRMED` status occupy resource or driver schedules.
- **History Preservation**: `REJECTED` and `CANCELLED` records remain fully archived for auditing.
- **Derivation**: `COMPLETED` is an operational state derived when `endTime < CURRENT_TIMESTAMP` for `CONFIRMED` reservations.

---

## 11. Testing & Verification

The test harness uses the native Node.js test runner (`node:test`) and supports both unit tests and isolated database concurrency tests:

### 1. Static Typing & Linting
```bash
# Validate TypeScript types without emitting code
npx tsc --noEmit

# Execute ESLint checks
npm run lint
```

### 2. Automated Test Suite
```bash
# Execute unit, simulated concurrency, and domain tests
node --test tests/*.test.mjs
```
*Current test baseline: **175 tests (172 passed, 3 skipped, 0 failed)**.* The 3 skipped tests represent PostgreSQL integration tests requiring `TEST_DATABASE_URL`.

### 3. PostgreSQL Integration Tests (Optional)
To run the live PostgreSQL exclusion constraint concurrency tests:
```bash
# Set TEST_DATABASE_URL to an isolated database ending in _test
$env:TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/resource_reservation_test"
node --test tests/*.integration.test.mjs
```

### 4. Production Build Verification
```bash
# Compile and build production bundles with Next.js Turbopack
npm run build
```

---

## 12. Production Considerations

- **PostgreSQL Migrations**: Execute `npx prisma migrate deploy --config prisma7.config.ts` during deployment pipelines. Never use `db push` in production.
- **Distributed Rate Limiting**: In serverless production environments (e.g., Vercel), provide `RATE_LIMIT_REDIS_REST_URL` and `RATE_LIMIT_REDIS_REST_TOKEN` (Upstash Redis). The system intentionally fails closed if unconfigured in production.
- **Blob Storage**: Configure `BLOB_READ_WRITE_TOKEN` via Vercel Blob store to enable photograph management.
- **Advisory Locks**: The initial administrator bootstrap script utilizes PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`) to prevent concurrent execution during provisioning.
- **Security Headers & Cookies**: Auth.js utilizes secure, `HttpOnly`, `SameSite=Lax` encrypted JWT cookies. Run over HTTPS in production.

---

## 13. Known Limitations

- **Timezone Assumptions**: The system standardizes on `Asia/Colombo` (UTC+05:30) for localized scheduling. It does not currently support multi-timezone localized scheduling displays.
- **Driver Allocation Constraints**: A vehicle reservation accommodates exactly one driver assignment. Multi-driver or relay assignments require distinct reservation records.
- **In-Memory Rate Limiting**: Development mode utilizes an in-memory Map for rate limiting, which resets upon process restart. Production mandates external Redis.

---

## 14. Repository Structure

```text
resource-reservation-system/
├── docs/                               # Architecture and engineering documentation
│   ├── authentication.md               # Auth.js, Argon2id, and credential verification
│   ├── design-system.md                # Enterprise UI design tokens, badges, and layout
│   ├── rendering-performance.md        # Next.js 16 partial prerendering & cache boundary specs
│   ├── resource-management.md          # Resource domain rules and category specifications
│   └── resource-photo-management.md    # Vercel Blob token exchange and security design
├── prisma/                             # Database schema and migration history
│   ├── migrations/                     # Versioned SQL migrations (GiST exclusions, schema)
│   └── schema.prisma                   # Prisma 7 schema definitions
├── public/                             # Static brand assets and conventions
├── scripts/                            # Operational CLI scripts
│   ├── bootstrap-admin.ts              # Interactive Administrator provisioning tool
│   └── run-admin-bootstrap.mjs         # Server-only execution loader
├── src/                                # Application source code
│   ├── app/                            # Next.js 16 App Router
│   │   ├── (auth)/                     # Authentication routes (/login, /change-password)
│   │   ├── (protected)/                # Authenticated workspace routes
│   │   │   ├── admin/                  # Administrative management and allocation pages
│   │   │   ├── department/             # Department Head approval queue pages
│   │   │   ├── dashboard/              # Live role-scoped operational dashboards
│   │   │   ├── reservations/           # Employee reservation views and direct booking
│   │   │   ├── resources/              # Resource catalog and detail views
│   │   │   └── transport/              # Category-based vehicle request forms
│   │   ├── api/                        # Route handlers (Auth.js and photo uploads)
│   │   ├── globals.css                 # Design tokens and custom subtle scrollbars
│   │   └── layout.tsx                  # Root layout and theme providers
│   ├── components/                     # Reusable UI, shell, navigation, and dialogs
│   ├── generated/prisma/               # Generated type-safe Prisma client
│   └── lib/                            # Server-only domain services, validations, and auth
├── tests/                              # Automated test suites
│   ├── helpers/                        # Test fixtures and database mock utilities
│   ├── *.test.mjs                      # Unit and simulated domain test suites
│   └── *.integration.test.mjs          # Live PostgreSQL concurrency integration tests
├── .env.example                        # Documented environment variable template
├── next.config.ts                      # Next.js 16 configuration
├── package.json                        # Project dependencies and operational scripts
├── prisma7.config.ts                   # Prisma 7 configuration file
├── tsconfig.json                       # TypeScript compiler options
└── README.md                           # Project technical documentation
```
