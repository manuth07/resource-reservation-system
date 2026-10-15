import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { requirePageUser } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { ReservationStatus, UserRole } from "@/generated/prisma/enums";
import {
  Card,
  CategoryBadge,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import {
  formatColomboDate,
  formatColomboTime,
} from "@/lib/reservation-validation";

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoading title="Dashboard" variant="detail" />}>
      <DashboardContent />
    </Suspense>
  );
}

function getStatusTone(status: ReservationStatus, isPast = false): StatusTone {
  if (isPast && status === ReservationStatus.CONFIRMED) return "neutral";
  switch (status) {
    case ReservationStatus.CONFIRMED:
      return "success";
    case ReservationStatus.PENDING:
    case ReservationStatus.AWAITING_APPROVAL:
      return "warning";
    case ReservationStatus.APPROVED:
      return "info";
    case ReservationStatus.REJECTED:
    case ReservationStatus.CANCELLED:
      return "danger";
    default:
      return "neutral";
  }
}

function getStatusLabel(
  status: ReservationStatus,
  isPast = false,
  isVehicle = false,
  resourceId?: string | null,
): string {
  if (isPast && status === ReservationStatus.CONFIRMED) return "Completed";
  switch (status) {
    case ReservationStatus.CONFIRMED:
      return "Confirmed";
    case ReservationStatus.PENDING:
      return "Pending review";
    case ReservationStatus.AWAITING_APPROVAL:
      return "Awaiting HOD";
    case ReservationStatus.APPROVED:
      return isVehicle && !resourceId ? "Ready to allocate" : "Ready to confirm";
    case ReservationStatus.REJECTED:
      return "Rejected";
    case ReservationStatus.CANCELLED:
      return "Cancelled";
    default:
      return status;
  }
}

async function DashboardContent() {
  await connection();
  const user = await requirePageUser();
  const now = new Date();

  if (user.role === UserRole.ADMIN) {
    return await AdminDashboard({ now });
  }

  if (user.role === UserRole.DEPARTMENT_HEAD) {
    return await DepartmentHeadDashboard({ userId: user.id, now });
  }

  return await EmployeeDashboard({ userId: user.id, now });
}

/* ==========================================================================
   ADMINISTRATOR DASHBOARD
   ========================================================================== */
async function AdminDashboard({ now }: { now: Date }) {
  const [
    pendingReviewCount,
    approvedCount,
    upcomingConfirmedCount,
    activeResourceCount,
    activeDriverCount,
    actionableRequests,
  ] = await Promise.all([
    prisma.reservation.count({
      where: { status: ReservationStatus.PENDING },
    }),
    prisma.reservation.count({
      where: { status: ReservationStatus.APPROVED },
    }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.CONFIRMED,
        startTime: { gt: now },
      },
    }),
    prisma.resource.count({
      where: { isActive: true },
    }),
    prisma.driver.count({
      where: { isActive: true },
    }),
    prisma.reservation.findMany({
      where: {
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.APPROVED],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        requester: { select: { id: true, name: true, employeeId: true } },
        department: { select: { id: true, name: true, code: true } },
        requestedCategory: { select: { id: true, name: true, isVehicle: true } },
        resource: { select: { id: true, name: true, resourceCode: true } },
      },
    }),
  ]);

  // If no pending/approved requests exist, fall back to recent requests for operational visibility
  let displayList = actionableRequests;
  let isActionableList = true;
  if (displayList.length === 0) {
    isActionableList = false;
    displayList = await prisma.reservation.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        requester: { select: { id: true, name: true, employeeId: true } },
        department: { select: { id: true, name: true, code: true } },
        requestedCategory: { select: { id: true, name: true, isVehicle: true } },
        resource: { select: { id: true, name: true, resourceCode: true } },
      },
    });
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        section="Administration"
        title="Administrative dashboard"
        description="Monitor system reservations, manage resource allocations, and review pending departmental requests."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="button button-primary" href="/admin/reservations">
              Reservation requests
            </Link>
            <Link className="button button-secondary" href="/admin/resources">
              Manage resources
            </Link>
          </div>
        }
      />

      {/* Primary KPI Metrics */}
      <section aria-label="Administrative metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Pending review
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {pendingReviewCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            {pendingReviewCount === 1 ? "1 request needs" : `${pendingReviewCount} requests need`} admin routing
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Ready to confirm / allocate
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {approvedCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            HOD-approved; awaiting final schedule
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Upcoming confirmed
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {upcomingConfirmedCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            Active reservations scheduled in future
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Active fleet & resources
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {activeResourceCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            {activeDriverCount} active {activeDriverCount === 1 ? "driver" : "drivers"} on roster
          </p>
        </Card>
      </section>

      {/* Actionable / Recent Requests Table */}
      <Card className="overflow-hidden">
        <div className="directory-header">
          <div>
            <h2 className="card-title">
              {isActionableList ? "Requests requiring action" : "Recent reservation requests"}
            </h2>
            <p className="directory-count">
              {isActionableList
                ? "Pending administrative review or final confirmation"
                : "Latest activity across organizational resources"}
            </p>
          </div>
          <Link href="/admin/reservations" className="text-link text-sm">
            View full queue →
          </Link>
        </div>

        {displayList.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No reservation requests"
              description="No reservation requests have been submitted yet."
            />
          </div>
        ) : (
          <DataTable label="Recent requests table">
            <thead>
              <tr>
                <th scope="col">Requester & Dept</th>
                <th scope="col">Resource / Type</th>
                <th scope="col">Date & Time</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((res) => {
                const dateStr = formatColomboDate(res.startTime);
                const timeStr = `${formatColomboTime(res.startTime)} – ${formatColomboTime(res.endTime)}`;
                const isPast = res.endTime < now;
                const tone = getStatusTone(res.status, isPast);
                const label = getStatusLabel(res.status, isPast, res.requestedCategory.isVehicle, res.resourceId);
                const isAllocate = res.requestedCategory.isVehicle && res.status === ReservationStatus.APPROVED && !res.resourceId;

                return (
                  <tr key={res.id}>
                    <td>
                      <div className="font-medium text-foreground">{res.requester.name}</div>
                      <div className="text-xs text-secondary">{res.department.name}</div>
                    </td>
                    <td>
                      <div className="font-medium text-foreground">
                        {res.resource?.name ?? (res.requestedCategory.isVehicle ? `${res.requestedCategory.name} Request` : "Unassigned")}
                      </div>
                      <div className="text-xs text-secondary">
                        <CategoryBadge category={res.requestedCategory} subtle />
                      </div>
                    </td>
                    <td>
                      <div className="text-sm tabular-nums text-foreground">{dateStr}</div>
                      <div className="text-xs tabular-nums text-secondary">{timeStr}</div>
                    </td>
                    <td>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={isAllocate ? `/admin/reservations/${res.id}#allocate` : `/admin/reservations/${res.id}`}
                        className={isAllocate ? "button button-primary button-sm" : "button button-neutral button-sm"}
                      >
                        {isAllocate ? "Allocate" : "Review"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {/* Quick Administrative Navigation Shortcuts */}
      <section aria-label="Administrative shortcuts" className="space-y-3">
        <h2 className="section-title text-base font-semibold text-foreground">Quick management access</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/reservations"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Reservation queue</p>
            <p className="text-xs text-secondary mt-1">Review, route, and confirm bookings</p>
          </Link>
          <Link
            href="/admin/resources"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Manage resources</p>
            <p className="text-xs text-secondary mt-1">Update rooms, equipment, and fleet</p>
          </Link>
          <Link
            href="/admin/drivers"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Driver roster</p>
            <p className="text-xs text-secondary mt-1">Manage transport drivers and statuses</p>
          </Link>
          <Link
            href="/admin/departments"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Departments</p>
            <p className="text-xs text-secondary mt-1">Designate HODs and view organization</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ==========================================================================
   DEPARTMENT HEAD DASHBOARD
   ========================================================================== */
async function DepartmentHeadDashboard({ userId, now }: { userId: string; now: Date }) {
  // Find all departments designated to this HOD
  const departments = await prisma.department.findMany({
    where: { headId: userId },
    select: { id: true, name: true, code: true },
  });
  const deptIds = departments.map((d) => d.id);

  const [
    pendingApprovalsCount,
    ownUpcomingCount,
    ownPendingCount,
    actionableApprovals,
  ] = await Promise.all([
    deptIds.length > 0
      ? prisma.reservation.count({
          where: {
            departmentId: { in: deptIds },
            status: ReservationStatus.AWAITING_APPROVAL,
            requesterId: { not: userId },
          },
        })
      : 0,
    prisma.reservation.count({
      where: {
        requesterId: userId,
        status: ReservationStatus.CONFIRMED,
        startTime: { gt: now },
      },
    }),
    prisma.reservation.count({
      where: {
        requesterId: userId,
        status: {
          in: [
            ReservationStatus.PENDING,
            ReservationStatus.AWAITING_APPROVAL,
            ReservationStatus.APPROVED,
          ],
        },
        endTime: { gt: now },
      },
    }),
    deptIds.length > 0
      ? prisma.reservation.findMany({
          where: {
            departmentId: { in: deptIds },
            status: ReservationStatus.AWAITING_APPROVAL,
            requesterId: { not: userId },
          },
          orderBy: { createdAt: "asc" },
          take: 5,
          include: {
            requester: { select: { id: true, name: true, employeeId: true } },
            department: { select: { id: true, name: true, code: true } },
            requestedCategory: { select: { id: true, name: true, isVehicle: true } },
            resource: { select: { id: true, name: true, resourceCode: true } },
          },
        })
      : [],
  ]);

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        section="Department"
        title="Department Head dashboard"
        description={
          departments.length > 0
            ? `Review and approve reservation requests submitted by members of ${departments.map((d) => d.name).join(", ")}.`
            : "Review departmental reservation requests and manage your personal bookings."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="button button-primary" href="/department/approvals">
              Approval queue
            </Link>
            <Link className="button button-secondary" href="/transport/request">
              Request transport
            </Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <section aria-label="Department metrics" className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-warning">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Awaiting your approval
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {pendingApprovalsCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            {pendingApprovalsCount === 1 ? "1 request requires" : `${pendingApprovalsCount} requests require`} departmental decision
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Your upcoming bookings
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {ownUpcomingCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            Confirmed personal reservations scheduled
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Your pending requests
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {ownPendingCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            Awaiting administrator review or confirmation
          </p>
        </Card>
      </section>

      {/* Actionable Department Approvals Queue */}
      <Card className="overflow-hidden">
        <div className="directory-header">
          <div>
            <h2 className="card-title">Department requests awaiting decision</h2>
            <p className="directory-count">
              {pendingApprovalsCount === 1 ? "1 request" : `${pendingApprovalsCount} requests`} in your approval queue
            </p>
          </div>
          <Link href="/department/approvals" className="text-link text-sm">
            View full approval queue →
          </Link>
        </div>

        {actionableApprovals.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Approval queue is clear"
              description="There are currently no departmental reservation requests waiting for your decision."
            />
          </div>
        ) : (
          <DataTable label="Department approvals table">
            <thead>
              <tr>
                <th scope="col">Requester</th>
                <th scope="col">Resource / Type</th>
                <th scope="col">Date & Time</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {actionableApprovals.map((res) => {
                const dateStr = formatColomboDate(res.startTime);
                const timeStr = `${formatColomboTime(res.startTime)} – ${formatColomboTime(res.endTime)}`;
                const isPast = res.endTime < now;
                const tone = getStatusTone(res.status, isPast);
                const label = getStatusLabel(res.status, isPast, res.requestedCategory.isVehicle, res.resourceId);

                return (
                  <tr key={res.id}>
                    <td>
                      <div className="font-medium text-foreground">{res.requester.name}</div>
                      <div className="text-xs text-secondary">{res.requester.employeeId}</div>
                    </td>
                    <td>
                      <div className="font-medium text-foreground">
                        {res.resource?.name ?? (res.requestedCategory.isVehicle ? `${res.requestedCategory.name} Request` : "Unassigned")}
                      </div>
                      <div className="text-xs text-secondary">
                        <CategoryBadge category={res.requestedCategory} subtle />
                      </div>
                    </td>
                    <td>
                      <div className="text-sm tabular-nums text-foreground">{dateStr}</div>
                      <div className="text-xs tabular-nums text-secondary">{timeStr}</div>
                    </td>
                    <td>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/reservations/${res.id}`}
                        className="button button-primary button-sm"
                      >
                        Decide
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {/* Quick Links */}
      <section aria-label="Department shortcuts" className="space-y-3">
        <h2 className="section-title text-base font-semibold text-foreground">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/resources"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Browse catalog</p>
            <p className="text-xs text-secondary mt-1">Explore rooms, equipment, and vehicles</p>
          </Link>
          <Link
            href="/transport/request"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Request transport</p>
            <p className="text-xs text-secondary mt-1">Book vehicles with assigned drivers</p>
          </Link>
          <Link
            href="/reservations"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">My reservations</p>
            <p className="text-xs text-secondary mt-1">Track and manage personal bookings</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ==========================================================================
   EMPLOYEE DASHBOARD
   ========================================================================== */
async function EmployeeDashboard({ userId, now }: { userId: string; now: Date }) {
  const [
    upcomingConfirmedCount,
    pendingRequestsCount,
    nextReservation,
    recentReservations,
  ] = await Promise.all([
    prisma.reservation.count({
      where: {
        requesterId: userId,
        status: ReservationStatus.CONFIRMED,
        startTime: { gt: now },
      },
    }),
    prisma.reservation.count({
      where: {
        requesterId: userId,
        status: {
          in: [
            ReservationStatus.PENDING,
            ReservationStatus.AWAITING_APPROVAL,
            ReservationStatus.APPROVED,
          ],
        },
        endTime: { gt: now },
      },
    }),
    prisma.reservation.findFirst({
      where: {
        requesterId: userId,
        status: ReservationStatus.CONFIRMED,
        startTime: { gt: now },
      },
      orderBy: { startTime: "asc" },
      include: {
        resource: { select: { id: true, name: true, resourceCode: true, location: true } },
        requestedCategory: { select: { id: true, name: true, isVehicle: true } },
        driver: { select: { id: true, name: true } },
      },
    }),
    prisma.reservation.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        resource: { select: { id: true, name: true, resourceCode: true } },
        requestedCategory: { select: { id: true, name: true, isVehicle: true } },
        driver: { select: { id: true, name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        title="Workspace dashboard"
        description="Schedule shared organizational facilities, request fleet transport, and monitor active reservations."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="button button-primary" href="/resources">
              Browse resources
            </Link>
            <Link className="button button-secondary" href="/transport/request">
              Request transport
            </Link>
          </div>
        }
      />

      {/* Overview Metric Cards */}
      <section aria-label="Reservation summary" className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Upcoming confirmed reservations
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {upcomingConfirmedCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            {upcomingConfirmedCount === 1 ? "1 active booking" : `${upcomingConfirmedCount} active bookings`} scheduled
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-secondary uppercase tracking-wider">
              Pending / In-review requests
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
              {pendingRequestsCount}
            </p>
          </div>
          <p className="mt-3 text-xs text-secondary">
            Awaiting HOD approval or administrative scheduling
          </p>
        </Card>
      </section>

      {/* Next Upcoming Reservation Spotlight */}
      {nextReservation && (
        <Card className="p-6 border-l-4 border-l-primary space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Next scheduled reservation
              </span>
              <h2 className="text-lg font-semibold text-foreground mt-0.5">
                {nextReservation.resource?.name ?? `${nextReservation.requestedCategory.name} Reservation`}
              </h2>
            </div>
            <Link
              href={`/reservations/${nextReservation.id}`}
              className="button button-neutral button-sm self-start sm:self-auto"
            >
              View details
            </Link>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3 text-sm pt-2 border-t border-border">
            <div>
              <dt className="text-xs text-secondary">Date</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {formatColomboDate(nextReservation.startTime)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-secondary">Time (Asia/Colombo)</dt>
              <dd className="font-medium text-foreground tabular-nums">
                {formatColomboTime(nextReservation.startTime)} – {formatColomboTime(nextReservation.endTime)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-secondary">
                {nextReservation.requestedCategory.isVehicle ? "Destination / Driver" : "Location"}
              </dt>
              <dd className="font-medium text-foreground">
                {nextReservation.requestedCategory.isVehicle
                  ? `${nextReservation.destination ?? "Local"} ${nextReservation.driver ? `• Driver: ${nextReservation.driver.name}` : ""}`
                  : (nextReservation.resource?.location ?? "Main Campus")}
              </dd>
            </div>
          </dl>
        </Card>
      )}

      {/* Recent Reservations Table */}
      <Card className="overflow-hidden">
        <div className="directory-header">
          <div>
            <h2 className="card-title">Recent reservation activity</h2>
            <p className="directory-count">Your latest requests and confirmed bookings</p>
          </div>
          <Link href="/reservations" className="text-link text-sm">
            View all my reservations →
          </Link>
        </div>

        {recentReservations.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No reservations yet"
              description="You have not submitted any reservations. Use the buttons above to book a meeting room, facility, or transport."
              action={
                <Link className="button button-primary" href="/resources">
                  Browse resources
                </Link>
              }
            />
          </div>
        ) : (
          <DataTable label="My recent reservations">
            <thead>
              <tr>
                <th scope="col">Resource / Category</th>
                <th scope="col">Date & Time</th>
                <th scope="col">Status</th>
                <th scope="col">Purpose</th>
                <th scope="col" className="text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentReservations.map((res) => {
                const dateStr = formatColomboDate(res.startTime);
                const timeStr = `${formatColomboTime(res.startTime)} – ${formatColomboTime(res.endTime)}`;
                const isPast = res.endTime < now;
                const tone = getStatusTone(res.status, isPast);
                const label = getStatusLabel(res.status, isPast, res.requestedCategory.isVehicle, res.resourceId);

                return (
                  <tr key={res.id}>
                    <td>
                      <div className="font-medium text-foreground">
                        {res.resource?.name ?? `${res.requestedCategory.name} Request`}
                      </div>
                      <div className="text-xs text-secondary">
                        <CategoryBadge category={res.requestedCategory} subtle />
                      </div>
                    </td>
                    <td>
                      <div className="text-sm tabular-nums text-foreground">{dateStr}</div>
                      <div className="text-xs tabular-nums text-secondary">{timeStr}</div>
                    </td>
                    <td>
                      <StatusBadge tone={tone}>{label}</StatusBadge>
                    </td>
                    <td className="max-w-xs truncate text-sm text-secondary" title={res.purpose}>
                      {res.purpose}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link
                        href={`/reservations/${res.id}`}
                        className="button button-neutral button-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {/* Quick Workspace Shortcuts */}
      <section aria-label="Workspace shortcuts" className="space-y-3">
        <h2 className="section-title text-base font-semibold text-foreground">Quick access</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/resources"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Browse catalog</p>
            <p className="text-xs text-secondary mt-1">Explore rooms, equipment, and facilities</p>
          </Link>
          <Link
            href="/transport/request"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">Request transport</p>
            <p className="text-xs text-secondary mt-1">Submit category-based vehicle requests</p>
          </Link>
          <Link
            href="/reservations"
            className="panel p-4 hover:border-secondary transition-colors block"
          >
            <p className="font-medium text-foreground text-sm">My reservations</p>
            <p className="text-xs text-secondary mt-1">Check status and cancellation options</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
