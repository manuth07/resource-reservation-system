import type { ReservationRecord } from "@/lib/reservation-types";
import { formatColomboDateTime } from "@/lib/reservation-validation";
import { Card, StatusBadge, type StatusTone } from "@/components/ui";

type TimelineStepProps = {
  stepNumber: number;
  title: string;
  badgeText: string;
  badgeTone: StatusTone;
  actorText?: string;
  timestamp?: string;
  notes?: string;
  rejectionReason?: string | null;
  isCurrent?: boolean;
};

function TimelineStep({
  stepNumber,
  title,
  badgeText,
  badgeTone,
  actorText,
  timestamp,
  notes,
  rejectionReason,
  isCurrent,
}: TimelineStepProps) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Step indicator */}
      <div className="flex flex-col items-center">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            isCurrent
              ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : badgeTone === "success"
              ? "bg-emerald-700 text-white"
              : badgeTone === "danger"
              ? "bg-rose-700 text-white"
              : "bg-surface-alt text-secondary border border-border"
          }`}
        >
          {stepNumber}
        </div>
        <div className="h-full w-0.5 bg-border mt-2 last:hidden" aria-hidden="true" />
      </div>

      {/* Step details */}
      <div className="flex-1 space-y-1.5 pt-0.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <StatusBadge tone={badgeTone}>{badgeText}</StatusBadge>
        </div>

        {actorText && (
          <p className="text-xs text-secondary">
            <span className="font-medium text-foreground">Action by:</span> {actorText}
          </p>
        )}

        {timestamp && (
          <p className="text-xs text-secondary tabular-nums">
            <span className="font-medium text-foreground">Time:</span> {timestamp} (Asia/Colombo)
          </p>
        )}

        {notes && <p className="text-xs text-secondary">{notes}</p>}

        {rejectionReason && (
          <div className="mt-2 rounded border border-rose-200 bg-rose-50/50 p-3 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold text-rose-700 dark:text-rose-300">
              Rejection reason:
            </p>
            <p className="mt-1 whitespace-pre-wrap">{rejectionReason}</p>
          </div>
        )}
      </div>
    </li>
  );
}

export function ApprovalTimeline({
  reservation,
}: {
  reservation: ReservationRecord;
}) {
  const isDirect =
    reservation.approvals.length === 0 &&
    (reservation.status === "CONFIRMED" ||
      (!reservation.resource?.requiresApproval && reservation.status !== "PENDING"));

  if (isDirect) {
    return (
      <Card className="p-6 sm:p-8 space-y-4">
        <h2 className="section-title">Approval audit trail</h2>
        <p className="text-sm text-secondary">
          This standard resource does not require multi-stage approval. The reservation was verified against real-time schedule availability and confirmed directly upon submission.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <StatusBadge tone="success">Direct booking confirmed</StatusBadge>
          <span className="text-xs text-secondary tabular-nums">
            {formatColomboDateTime(reservation.createdAt)}
          </span>
        </div>
      </Card>
    );
  }

  const approvals = reservation.approvals ?? [];
  const adminReview = approvals.find((a) => a.stage === "ADMIN_REVIEW");
  const hodApproval = approvals.find(
    (a) => a.stage === "DEPARTMENT_HEAD_APPROVAL",
  );
  const adminConfirm = approvals.find(
    (a) => a.stage === "ADMIN_CONFIRMATION",
  );

  return (
    <Card className="p-6 sm:p-8 space-y-6">
      <div>
        <h2 className="section-title">Approval audit workflow</h2>
        <p className="mt-1 text-sm text-secondary">
          Track the formal review stages, assigned approvers, timestamps, and decisions for this reservation request.
        </p>
      </div>

      <ol className="mt-6 space-y-2">
        {/* Step 1: Submission */}
        <TimelineStep
          stepNumber={1}
          title="1. Request submission"
          badgeText="Submitted"
          badgeTone="success"
          actorText={`${reservation.requester.name} (${reservation.requester.employeeId})`}
          timestamp={formatColomboDateTime(reservation.createdAt)}
          notes={`Submitted under department: ${reservation.department.name} (${reservation.department.code})`}
        />

        {/* Step 2: Admin Review */}
        {adminReview ? (
          <TimelineStep
            stepNumber={2}
            title="2. Administrator review"
            badgeText={
              adminReview.decision === "APPROVED"
                ? "Forwarded to HOD"
                : "Rejected by Admin"
            }
            badgeTone={adminReview.decision === "APPROVED" ? "success" : "danger"}
            actorText={`${adminReview.approver.name} (${adminReview.approver.email})`}
            timestamp={formatColomboDateTime(adminReview.decidedAt)}
            rejectionReason={adminReview.rejectionReason}
          />
        ) : (
          <TimelineStep
            stepNumber={2}
            title="2. Administrator review"
            badgeText={
              reservation.status === "PENDING"
                ? "Pending review"
                : reservation.status === "CANCELLED"
                ? "Cancelled"
                : "Pending"
            }
            badgeTone={reservation.status === "PENDING" ? "warning" : "neutral"}
            isCurrent={reservation.status === "PENDING"}
            notes={
              reservation.status === "PENDING"
                ? "Awaiting administrative review to verify details and route to the Department Head."
                : reservation.status === "CANCELLED"
                ? "Reservation was cancelled by the requester before review."
                : "Not started"
            }
          />
        )}

        {/* Step 3: HOD Decision */}
        {hodApproval ? (
          <TimelineStep
            stepNumber={3}
            title="3. Department Head approval"
            badgeText={
              hodApproval.decision === "APPROVED"
                ? "Approved by HOD"
                : "Rejected by HOD"
            }
            badgeTone={hodApproval.decision === "APPROVED" ? "success" : "danger"}
            actorText={`${hodApproval.approver.name} (${hodApproval.approver.email})`}
            timestamp={formatColomboDateTime(hodApproval.decidedAt)}
            rejectionReason={hodApproval.rejectionReason}
          />
        ) : (
          <TimelineStep
            stepNumber={3}
            title="3. Department Head approval"
            badgeText={
              reservation.status === "AWAITING_APPROVAL"
                ? "Awaiting HOD decision"
                : adminReview?.decision === "REJECTED"
                ? "Not reached"
                : reservation.status === "CANCELLED"
                ? "Cancelled"
                : "Pending review"
            }
            badgeTone={
              reservation.status === "AWAITING_APPROVAL" ? "warning" : "neutral"
            }
            isCurrent={reservation.status === "AWAITING_APPROVAL"}
            notes={
              reservation.status === "AWAITING_APPROVAL"
                ? `Assigned to ${reservation.department.name} Department Head for authorization.`
                : adminReview?.decision === "REJECTED"
                ? "Request was rejected during administrative review."
                : undefined
            }
          />
        )}

        {/* Step 4: Final Confirmation */}
        {adminConfirm ? (
          <TimelineStep
            stepNumber={4}
            title="4. Final administrative confirmation"
            badgeText="Confirmed and scheduled"
            badgeTone="success"
            actorText={`${adminConfirm.approver.name} (${adminConfirm.approver.email})`}
            timestamp={formatColomboDateTime(adminConfirm.decidedAt)}
          />
        ) : (
          <TimelineStep
            stepNumber={4}
            title="4. Final administrative confirmation"
            badgeText={
              reservation.status === "APPROVED"
                ? "Ready for confirmation"
                : reservation.status === "CONFIRMED"
                ? "Confirmed"
                : reservation.status === "REJECTED"
                ? "Not reached"
                : reservation.status === "CANCELLED"
                ? "Cancelled"
                : "Pending"
            }
            badgeTone={
              reservation.status === "APPROVED"
                ? "info"
                : reservation.status === "CONFIRMED"
                ? "success"
                : "neutral"
            }
            isCurrent={reservation.status === "APPROVED"}
            notes={
              reservation.status === "APPROVED"
                ? reservation.requestedCategory.isVehicle
                  ? "Approved by Department Head. Awaiting final vehicle and driver allocation by Administrator."
                  : "Approved by Department Head. Awaiting final Administrator scheduling confirmation."
                : undefined
            }
          />
        )}
      </ol>
    </Card>
  );
}
