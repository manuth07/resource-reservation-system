-- Initial schema and custom integrity constraints are applied atomically.
BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'ADMIN', 'DEPARTMENT_HEAD');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('ADMIN_REVIEW', 'DEPARTMENT_HEAD_APPROVAL', 'ADMIN_CONFIRMATION');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "headId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "isVehicle" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ResourceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "resourceCode" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "capacity" INTEGER,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "requestedCategoryId" UUID NOT NULL,
    "resourceId" UUID,
    "driverId" UUID,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "destination" TEXT,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "approverId" UUID NOT NULL,
    "stage" "ApprovalStage" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "rejectionReason" TEXT,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "driverIdentifier" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_headId_idx" ON "Department"("headId");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_departmentId_role_accountStatus_idx" ON "User"("departmentId", "role", "accountStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCategory_name_key" ON "ResourceCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceCategory_code_key" ON "ResourceCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_resourceCode_key" ON "Resource"("resourceCode");

-- CreateIndex
CREATE INDEX "Resource_categoryId_isActive_requiresApproval_idx" ON "Resource"("categoryId", "isActive", "requiresApproval");

-- CreateIndex
CREATE INDEX "Reservation_startTime_endTime_idx" ON "Reservation"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "Reservation_status_startTime_idx" ON "Reservation"("status", "startTime");

-- CreateIndex
CREATE INDEX "Reservation_resourceId_status_startTime_endTime_idx" ON "Reservation"("resourceId", "status", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Reservation_driverId_status_startTime_endTime_idx" ON "Reservation"("driverId", "status", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Reservation_requesterId_createdAt_idx" ON "Reservation"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "Reservation_departmentId_status_startTime_idx" ON "Reservation"("departmentId", "status", "startTime");

-- CreateIndex
CREATE INDEX "Reservation_requestedCategoryId_status_startTime_idx" ON "Reservation"("requestedCategoryId", "status", "startTime");

-- CreateIndex
CREATE INDEX "Approval_approverId_decidedAt_idx" ON "Approval"("approverId", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_reservationId_stage_key" ON "Approval"("reservationId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_driverIdentifier_key" ON "Driver"("driverIdentifier");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ResourceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_requestedCategoryId_fkey" FOREIGN KEY ("requestedCategoryId") REFERENCES "ResourceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom PostgreSQL integrity constraints (not expressible in Prisma PSL).
-- Install UUID equality support for the multicolumn GiST exclusions.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_valid_time_interval_check"
    CHECK ("endTime" > "startTime");

ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_confirmed_resource_check"
    CHECK ("status" <> 'CONFIRMED'::"ReservationStatus" OR "resourceId" IS NOT NULL);

-- Resource.capacity is a nullable INTEGER; null means capacity is unspecified.
ALTER TABLE "Resource"
    ADD CONSTRAINT "Resource_positive_capacity_check"
    CHECK ("capacity" IS NULL OR "capacity" > 0);

-- Only CONFIRMED rows consume availability. [) allows adjacent reservations.
-- Enforced for inserts and updates, including assignment and status changes.
ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_confirmed_resource_no_overlap"
    EXCLUDE USING gist (
        "resourceId" WITH =,
        tstzrange("startTime", "endTime", '[)') WITH &&
    )
    WHERE ("status" = 'CONFIRMED'::"ReservationStatus" AND "resourceId" IS NOT NULL);

ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_confirmed_driver_no_overlap"
    EXCLUDE USING gist (
        "driverId" WITH =,
        tstzrange("startTime", "endTime", '[)') WITH &&
    )
    WHERE ("status" = 'CONFIRMED'::"ReservationStatus" AND "driverId" IS NOT NULL);

COMMIT;
