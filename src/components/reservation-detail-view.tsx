import { NavigationLink as Link } from "@/components/navigation-link";
import { UserRole } from "@/generated/prisma/enums";
import type {
  DisplayReservationStatus,
  ReservationRecord,
} from "@/lib/reservation-types";
import {
  Card,
  CategoryBadge,
  Feedback,
  PageHeader,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import {
  formatColomboDate,
  formatColomboDateTime,
  formatColomboTime,
} from "@/lib/reservation-validation";
import { ReservationCancelControl } from "@/components/reservation-cancel-control";
import { ApprovalControls } from "@/components/approval-controls";
import { ApprovalTimeline } from "@/components/approval-timeline";
import { VehicleAllocationPanel } from "@/components/vehicle-allocation-panel";
import type { listAvailableVehicles } from "@/lib/reservation-service";
import type { listAvailableDrivers } from "@/lib/driver-service";

export type ReservationDetailViewProps = {
  reservation: ReservationRecord;
  currentUser: {
    id: string;
    role: UserRole;
  };
  context: "admin" | "workspace";
  alerts?: {
    created?: string;
    requested?: string;
    allocated?: string;
    transport?: string;
  };
  availableVehicles?: Awaited<ReturnType<typeof listAvailableVehicles>>;
  availableDrivers?: Awaited<ReturnType<typeof listAvailableDrivers>>;
};

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

export function ReservationDetailView({
  reservation,
  currentUser,
  context,
  alerts,
  availableVehicles = [],
  availableDrivers = [],
}: ReservationDetailViewProps) {
  const isOwner = currentUser.id === reservation.requesterId;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isDepartmentHeadForReservation =
    currentUser.role === UserRole.DEPARTMENT_HEAD &&
    reservation.department.headId === currentUser.id;

  const canCancel =
    (isOwner || isAdmin) &&
    (reservation.status === "PENDING" ||
      reservation.status === "AWAITING_APPROVAL" ||
      reservation.status === "APPROVED" ||
      (reservation.status === "CONFIRMED" &&
        reservation.displayStatus !== "COMPLETED"));

  const isApprovedVehicleAwaitingAllocation =
    isAdmin &&
    reservation.status === "APPROVED" &&
    reservation.requestedCategory.isVehicle &&
    !reservation.resourceId;

  const tone = getStatusTone(reservation.displayStatus);
  const statusLabel = getStatusLabel(reservation.displayStatus);

  const dateStr = formatColomboDate(reservation.startTime);
  const startTimeStr = formatColomboTime(reservation.startTime);
  const endTimeStr = formatColomboTime(reservation.endTime);
  const createdAtStr = formatColomboDateTime(reservation.createdAt);

  const headerSection =
    context === "admin"
      ? "Administration"
      : reservation.requestedCategory.isVehicle
        ? "Transport reservation"
        : "Reservations";

  const headerTitle =
    context === "admin" && isApprovedVehicleAwaitingAllocation
      ? "Allocate vehicle and driver"
      : reservation.resource?.name ??
        (reservation.requestedCategory.isVehicle
          ? `${reservation.requestedCategory.name} Request`
          : context === "admin"
            ? "Reservation request details"
            : "Resource reservation");

  return (
    <>
      <PageHeader
        section={headerSection}
        title={headerTitle}
        description={`Reference ID: ${reservation.id}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
            {reservation.resource && (
              <Link
                href={
                  context === "admin"
                    ? `/admin/resources/${reservation.resource.id}/edit`
                    : `/resources/${reservation.resource.id}`
                }
                className="button button-neutral"
              >
                {context === "admin" ? "Manage resource" : "View resource"}
              </Link>
            )}
          </div>
        }
      />

      <div className="max-w-3xl space-y-6">
        {alerts?.created === "1" && (
          <Feedback tone="success">
            Your direct reservation has been confirmed and scheduled successfully.
          </Feedback>
        )}

        {alerts?.requested === "1" && (
          <Feedback tone="info">
            {reservation.requestedCategory.isVehicle
              ? "Your transport request has been submitted successfully and is pending administrative review and Department Head approval. A vehicle and driver will be allocated upon final confirmation."
              : "Your reservation request has been submitted successfully and is now pending administrative review. You will see progress updates on this page as decisions are recorded."}
          </Feedback>
        )}

        {alerts?.allocated === "1" && (
          <Feedback tone="success">
            Vehicle and driver have been allocated and the transport reservation is now confirmed.
          </Feedback>
        )}

        {/* Approval Decision Controls for Authorized Admins or HODs */}
        <ApprovalControls
          reservationId={reservation.id}
          status={reservation.status}
          userRole={currentUser.role}
          isDepartmentHeadForReservation={isDepartmentHeadForReservation}
          isRequester={isOwner}
          isVehicle={reservation.requestedCategory.isVehicle}
          resourceId={reservation.resourceId}
        />

        {/* Dedicated Admin Vehicle & Driver Allocation Interface */}
        {isApprovedVehicleAwaitingAllocation && (
          <VehicleAllocationPanel
            reservationId={reservation.id}
            categoryName={reservation.requestedCategory.name}
            passengerCount={reservation.passengerCount}
            destination={reservation.destination}
            purpose={reservation.purpose}
            dateStr={dateStr}
            timeIntervalStr={`${startTimeStr} – ${endTimeStr}`}
            availableVehicles={availableVehicles}
            availableDrivers={availableDrivers}
          />
        )}

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
              ? "Transport specifications"
              : "Reserved resource"}
          </h2>
          {reservation.requestedCategory.isVehicle ? (
            <dl className="grid gap-6 sm:grid-cols-2">
              <div>
                <dt className="form-label">Vehicle category</dt>
                <dd className="mt-1">
                  <CategoryBadge category={reservation.requestedCategory} />
                </dd>
              </div>
              <div>
                <dt className="form-label">Assigned vehicle</dt>
                <dd className="mt-1 text-base font-medium text-foreground">
                  {reservation.resource ? (
                    <span>
                      {reservation.resource.name}{" "}
                      <span className="font-mono text-sm text-secondary">
                        ({reservation.resource.resourceCode})
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-secondary italic">
                      Vehicle awaiting allocation
                    </span>
                  )}
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
                <dd className="mt-1 text-base font-medium text-foreground">
                  {reservation.driver ? (
                    <span>
                      {reservation.driver.name}{" "}
                      <span className="text-xs text-secondary font-mono">
                        (ID: {reservation.driver.driverIdentifier})
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-secondary italic">
                      Driver awaiting allocation
                    </span>
                  )}
                </dd>
              </div>
              {reservation.resource ? (
                <div>
                  <dt className="form-label">Vehicle seating capacity</dt>
                  <dd className="mt-1 text-sm text-secondary tabular-nums">
                    {reservation.resource.capacity ? `${reservation.resource.capacity} seats` : "Not specified"}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt className="form-label">Allocation procedure</dt>
                  <dd className="mt-1 text-sm text-secondary">
                    Vehicles and drivers are allocated by Administrators during final scheduling.
                  </dd>
                </div>
              )}
            </dl>
          ) : reservation.resource ? (
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

        {/* Manage reservation / Cancellation Section */}
        <Card className="p-6 sm:p-8">
          <h2 className="section-title">Manage reservation</h2>
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
                      ? (reservation.requestedCategory.isVehicle
                          ? "Cancelling immediately releases the vehicle and driver for other bookings. Cancelled reservations remain in your history."
                          : "Cancelling immediately frees the resource for other team members. Cancelled reservations remain in your history.")
                      : "Withdrawing cancels your request and marks it as cancelled in the queue. Cancelled reservations remain in your history."}
                  </p>
                </div>
                <ReservationCancelControl
                  reservationId={reservation.id}
                  isVehicle={reservation.requestedCategory.isVehicle}
                />
              </div>
            ) : reservation.displayStatus === "COMPLETED" ? (
              <p className="text-sm text-secondary">
                This reservation period has concluded. Completed reservations cannot be modified or cancelled. Historical records are preserved.
              </p>
            ) : reservation.status === "CANCELLED" ? (
              <p className="text-sm text-secondary">
                This reservation was cancelled. Historical records are preserved.
              </p>
            ) : reservation.status === "REJECTED" ? (
              <p className="text-sm text-secondary">
                This request was rejected. Historical records and reviewer notes are preserved in the audit timeline above.
              </p>
            ) : (
              <p className="text-sm text-secondary">
                No modifications can be made to this reservation at this time. Historical records are preserved.
              </p>
            )}
          </div>
        </Card>

        <div>
          {context === "admin" ? (
            <Link href="/admin/reservations" className="text-link inline-block">
              Back to reservation requests
            </Link>
          ) : (
            <Link href="/reservations" className="text-link inline-block">
              Back to my reservations
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
