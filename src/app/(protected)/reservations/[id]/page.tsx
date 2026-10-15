import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { requirePageUser } from "@/lib/page-auth";
import { getReservation } from "@/lib/reservation-service";
import type { DisplayReservationStatus } from "@/lib/reservation-types";
import {
  Card,
  CategoryBadge,
  Feedback,
  PageHeader,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import {
  formatColomboDate,
  formatColomboDateTime,
  formatColomboTime,
} from "@/lib/reservation-validation";
import { ReservationCancelControl } from "@/components/reservation-cancel-control";
import { ApprovalControls } from "@/components/approval-controls";
import { ApprovalTimeline } from "@/components/approval-timeline";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; requested?: string }>;
};

export default function ReservationDetailPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Reservation details" variant="detail" />}>
      <ReservationDetailContent {...props} />
    </Suspense>
  );
}

function getStatusTone(status: DisplayReservationStatus): StatusTone {
  switch (status) {
    case "CONFIRMED":
      return "success";
    case "COMPLETED":
      return "neutral";
    case "CANCELLED":
    case "REJECTED":
      return "danger";
    case "PENDING":
    case "AWAITING_APPROVAL":
      return "warning";
    case "APPROVED":
      return "info";
    default:
      return "neutral";
  }
}

function getStatusLabel(status: DisplayReservationStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PENDING":
      return "Pending review";
    case "AWAITING_APPROVAL":
      return "Awaiting HOD approval";
    case "APPROVED":
      return "Approved (Ready to confirm)";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

async function ReservationDetailContent({ params, searchParams }: Props) {
  await connection();
  const user = await requirePageUser();

  const { id } = await params;
  const { created, requested } = await searchParams;

  const reservation = await getReservation(id);

  if (!reservation) {
    notFound();
  }

  const isOwner = user.id === reservation.requesterId;
  const isAdmin = user.role === "ADMIN";
  const isDepartmentHeadForReservation =
    user.role === "DEPARTMENT_HEAD" &&
    reservation.department.headId === user.id;

  const canCancel =
    (isOwner || isAdmin) &&
    (reservation.status === "PENDING" ||
      reservation.status === "AWAITING_APPROVAL" ||
      reservation.status === "APPROVED" ||
      (reservation.status === "CONFIRMED" &&
        reservation.displayStatus !== "COMPLETED"));

  const tone = getStatusTone(reservation.displayStatus);
  const statusLabel = getStatusLabel(reservation.displayStatus);

  const dateStr = formatColomboDate(reservation.startTime);
  const startTimeStr = formatColomboTime(reservation.startTime);
  const endTimeStr = formatColomboTime(reservation.endTime);
  const createdAtStr = formatColomboDateTime(reservation.createdAt);

  return (
    <>
      <PageHeader
        section={reservation.requestedCategory.isVehicle ? "Transport reservation" : "Reservations"}
        title={
          reservation.resource?.name ??
          (reservation.requestedCategory.isVehicle
            ? `${reservation.requestedCategory.name} Request`
            : "Resource reservation")
        }
        description={`Reference ID: ${reservation.id}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
            {reservation.resource && (
              <Link
                href={`/resources/${reservation.resource.id}`}
                className="button button-neutral"
              >
                View resource
              </Link>
            )}
          </div>
        }
      />

      <div className="max-w-3xl space-y-6">
        {created === "1" && (
          <Feedback tone="success">
            Your direct reservation has been confirmed and scheduled successfully.
          </Feedback>
        )}

        {requested === "1" && (
          <Feedback tone="info">
            {reservation.requestedCategory.isVehicle
              ? "Your transport request has been submitted successfully and is pending administrative review and Department Head approval. A vehicle and driver will be allocated upon final confirmation."
              : "Your reservation request has been submitted successfully and is now pending administrative review. You will see progress updates on this page as decisions are recorded."}
          </Feedback>
        )}

        {/* Approval Decision Controls for Authorized Admins or HODs */}
        <ApprovalControls
          reservationId={reservation.id}
          status={reservation.status}
          userRole={user.role}
          isDepartmentHeadForReservation={isDepartmentHeadForReservation}
          isRequester={isOwner}
          isVehicle={reservation.requestedCategory.isVehicle}
          resourceId={reservation.resourceId}
        />

        {/* Primary Schedule & Timing Information */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="section-title">Schedule and timing</h2>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="form-label">Reservation date</dt>
              <dd className="mt-1 text-base font-semibold text-foreground tabular-nums">
                {dateStr}
              </dd>
            </div>
            <div>
              <dt className="form-label">Time interval (Asia/Colombo)</dt>
              <dd className="mt-1 text-base font-semibold text-foreground tabular-nums">
                {startTimeStr} – {endTimeStr}
              </dd>
            </div>
            <div>
              <dt className="form-label">Submitted on</dt>
              <dd className="mt-1 text-sm text-secondary tabular-nums">
                {createdAtStr}
              </dd>
            </div>
            <div>
              <dt className="form-label">Current status</dt>
              <dd className="mt-1">
                <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
              </dd>
            </div>
          </dl>
        </Card>

        {/* Multi-stage Approval Audit Workflow */}
        <ApprovalTimeline reservation={reservation} />

        {/* Resource Details / Transport Specifications */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="section-title">
            {reservation.requestedCategory.isVehicle
              ? "Requested transport specifications"
              : "Reserved resource"}
          </h2>
          {reservation.resource ? (
            <dl className="grid gap-6 sm:grid-cols-2">
              <div>
                <dt className="form-label">Resource name</dt>
                <dd className="mt-1 text-base font-medium text-foreground">
                  {reservation.resource.name}
                </dd>
              </div>
              <div>
                <dt className="form-label">Resource code</dt>
                <dd className="mt-1 font-mono text-sm text-secondary">
                  {reservation.resource.resourceCode}
                </dd>
              </div>
              <div>
                <dt className="form-label">Category</dt>
                <dd className="mt-1">
                  <CategoryBadge category={reservation.requestedCategory} />
                </dd>
              </div>
              <div>
                <dt className="form-label">Location</dt>
                <dd className="mt-1 text-sm text-secondary">
                  {reservation.resource.location ?? "Not specified"}
                </dd>
              </div>
              <div>
                <dt className="form-label">Capacity</dt>
                <dd className="mt-1 text-sm text-secondary tabular-nums">
                  {reservation.resource.capacity ? `${reservation.resource.capacity} people` : "Not specified"}
                </dd>
              </div>
              <div>
                <dt className="form-label">Approval policy</dt>
                <dd className="mt-1 text-sm text-secondary">
                  {reservation.resource.requiresApproval
                    ? "Requires Department Head and Admin approval"
                    : "Direct booking eligible"}
                </dd>
              </div>
            </dl>
          ) : reservation.requestedCategory.isVehicle ? (
            <dl className="grid gap-6 sm:grid-cols-2">
              <div>
                <dt className="form-label">Vehicle category</dt>
                <dd className="mt-1">
                  <CategoryBadge category={reservation.requestedCategory} />
                </dd>
              </div>
              <div>
                <dt className="form-label">Assigned vehicle</dt>
                <dd className="mt-1 text-sm text-secondary italic">
                  Vehicle awaiting allocation
                </dd>
              </div>
              <div>
                <dt className="form-label">Destination</dt>
                <dd className="mt-1 text-base font-medium text-foreground">
                  {reservation.destination ?? "Not specified"}
                </dd>
              </div>
              <div>
                <dt className="form-label">Passenger count</dt>
                <dd className="mt-1 text-base font-semibold text-foreground tabular-nums">
                  {reservation.passengerCount ? `${reservation.passengerCount} passengers` : "Not specified"}
                </dd>
              </div>
              <div>
                <dt className="form-label">Assigned driver</dt>
                <dd className="mt-1 text-sm text-secondary italic">
                  Driver awaiting allocation
                </dd>
              </div>
              <div>
                <dt className="form-label">Allocation procedure</dt>
                <dd className="mt-1 text-sm text-secondary">
                  Vehicles and drivers are allocated by Administrators during final scheduling.
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-secondary text-sm">
              The assigned resource has been unlinked or deleted.
            </p>
          )}
        </Card>

        {/* Requester & Department Information */}
        <Card className="p-6 sm:p-8 space-y-6">
          <h2 className="section-title">Booking party & department</h2>
          <dl className="grid gap-6 sm:grid-cols-2">
            <div>
              <dt className="form-label">Requested by</dt>
              <dd className="mt-1 text-sm text-foreground">
                <strong>{reservation.requester.name}</strong> ({reservation.requester.employeeId})
              </dd>
              <dd className="text-xs text-secondary">{reservation.requester.email}</dd>
            </div>
            <div>
              <dt className="form-label">Department snapshot</dt>
              <dd className="mt-1 text-sm text-foreground">
                {reservation.department.name} ({reservation.department.code})
              </dd>
              <dd className="text-xs text-muted">
                Recorded at time of request to preserve organizational audit trails.
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="form-label">Stated purpose</h3>
            <p className="mt-2 rounded border border-border bg-table-header p-4 text-sm text-foreground whitespace-pre-wrap">
              {reservation.purpose}
            </p>
          </div>
        </Card>

        {/* Cancellation or Status Actions */}
        <Card className="p-6 sm:p-8">
          <h2 className="section-title">Actions & lifecycle</h2>
          <div className="mt-4">
            {canCancel ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reservation.status === "CONFIRMED"
                      ? "Need to release this reservation?"
                      : "Withdraw this reservation request?"}
                  </p>
                  <p className="text-xs text-secondary mt-0.5">
                    {reservation.status === "CONFIRMED"
                      ? "Cancelling immediately frees the resource for other team members."
                      : "Withdrawing cancels your request and marks it as cancelled in the queue."}
                  </p>
                </div>
                <ReservationCancelControl reservationId={reservation.id} />
              </div>
            ) : reservation.displayStatus === "COMPLETED" ? (
              <p className="text-sm text-secondary">
                This reservation period has concluded. Completed reservations cannot be modified or cancelled.
              </p>
            ) : reservation.status === "CANCELLED" ? (
              <p className="text-sm text-secondary">
                This reservation was cancelled. Historical records are preserved.
              </p>
            ) : reservation.status === "REJECTED" ? (
              <p className="text-sm text-secondary">
                This request was rejected. See the audit workflow above for details and reviewer notes.
              </p>
            ) : (
              <p className="text-sm text-secondary">
                No modifications can be made to this reservation at this time.
              </p>
            )}
          </div>
        </Card>

        <div>
          <Link href="/reservations" className="text-link inline-block">
            Back to my reservations
          </Link>
        </div>
      </div>
    </>
  );
}
