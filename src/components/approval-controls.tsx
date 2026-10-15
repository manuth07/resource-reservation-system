"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  adminFinalConfirmAction,
  adminForwardAction,
  adminRejectAction,
  hodApproveAction,
  hodRejectAction,
} from "@/app/reservation-actions";
import { Button, Card, Feedback } from "@/components/ui";

type RejectionDialogProps = {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function RejectionDialog({
  open,
  title,
  description,
  pending,
  error,
  onCancel,
  onConfirm,
}: RejectionDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el || !open) return;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    setReason("");
    setValidationError(null);
    textarea.current?.focus();
    return () => {
      el.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setValidationError("Please enter a rejection reason.");
      textarea.current?.focus();
      return;
    }
    if (trimmed.length > 1000) {
      setValidationError("Rejection reason cannot exceed 1000 characters.");
      textarea.current?.focus();
      return;
    }
    setValidationError(null);
    onConfirm(trimmed);
  };

  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      aria-busy={pending}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2 id={`${id}-title`} className="section-title">
          {title}
        </h2>
        <p id={`${id}-desc`} className="mt-2 text-sm text-secondary">
          {description}
        </p>

        {(validationError || error) && (
          <Feedback tone="danger" className="mt-4">
            {validationError || error}
          </Feedback>
        )}

        <div className="mt-4 space-y-2">
          <label htmlFor={`${id}-reason`} className="form-label">
            Reason for rejection <span className="supporting-text">(required)</span>
          </label>
          <textarea
            id={`${id}-reason`}
            ref={textarea}
            rows={4}
            className="field w-full resize-y text-sm"
            placeholder="Explain why this request is being rejected (e.g., room undergoing maintenance, alternate room recommended)…"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (validationError) setValidationError(null);
            }}
            disabled={pending}
            maxLength={1000}
            required
          />
          <div className="flex justify-between text-xs text-secondary">
            <span>Minimum 1 character</span>
            <span className="tabular-nums">{reason.length} / 1000</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Rejecting…" : "Confirm rejection"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export type ApprovalControlsProps = {
  reservationId: string;
  status: string;
  userRole: string;
  isDepartmentHeadForReservation?: boolean;
  isRequester?: boolean;
  compact?: boolean;
  isVehicle?: boolean;
  resourceId?: string | null;
  onSuccess?: () => void;
};

export function ApprovalControls({
  reservationId,
  status,
  userRole,
  isDepartmentHeadForReservation = false,
  isRequester = false,
  compact = false,
  isVehicle = false,
  resourceId,
  onSuccess,
}: ApprovalControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isAdmin = userRole === "ADMIN";
  const isHod = isDepartmentHeadForReservation;

  const isVehicleRequest = isVehicle || resourceId === null;

  // Determine what actions are available based on role and reservation status
  const canAdminReview = isAdmin && status === "PENDING";
  const canHodDecide = isHod && status === "AWAITING_APPROVAL";
  const canAdminConfirm = isAdmin && status === "APPROVED" && !isVehicleRequest;
  const isApprovedVehicleAwaitingAllocation =
    isAdmin && status === "APPROVED" && isVehicleRequest;

  if (
    !canAdminReview &&
    !canHodDecide &&
    !canAdminConfirm &&
    !isApprovedVehicleAwaitingAllocation
  ) {
    return null;
  }

  const handleAdminForward = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", reservationId);
      const res = await adminForwardAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess?.();
      }
    });
  };

  const handleHodApprove = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", reservationId);
      const res = await hodApproveAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess?.();
      }
    });
  };

  const handleAdminConfirm = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", reservationId);
      const res = await adminFinalConfirmAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess?.();
      }
    });
  };

  const handleConfirmRejection = (reason: string) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", reservationId);
      fd.set("rejectionReason", reason);

      let res;
      if (canAdminReview) {
        res = await adminRejectAction(fd);
      } else if (canHodDecide) {
        res = await hodRejectAction(fd);
      }

      if (res?.error) {
        setError(res.error);
      } else {
        setRejectOpen(false);
        onSuccess?.();
      }
    });
  };

  // If HOD is the requester on a request waiting for HOD approval, block self-approval
  if (canHodDecide && isRequester) {
    if (compact) {
      return (
        <span className="text-xs text-secondary italic">
          Self-approval restricted
        </span>
      );
    }
    return (
      <Card className="p-6 sm:p-8 space-y-4">
        <h2 className="section-title">Department approval decision</h2>
        <Feedback tone="warning">
          <strong>Self-approval restricted:</strong> You submitted this reservation request. Department Heads cannot approve their own requests. Please contact an Administrator to review or decide this request.
        </Feedback>
      </Card>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-1">
        {error && (
          <span className="text-xs text-danger max-w-xs text-right">
            {error}
          </span>
        )}
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {canAdminReview && (
            <>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="whitespace-nowrap"
                disabled={isPending}
                onClick={handleAdminForward}
              >
                {isPending ? "Forwarding…" : "Forward to HOD"}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="whitespace-nowrap"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  setRejectOpen(true);
                }}
              >
                Reject
              </Button>
            </>
          )}

          {canHodDecide && (
            <>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="whitespace-nowrap"
                disabled={isPending}
                onClick={handleHodApprove}
              >
                {isPending ? "Approving…" : "Approve"}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="whitespace-nowrap"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  setRejectOpen(true);
                }}
              >
                Reject
              </Button>
            </>
          )}

          {canAdminConfirm && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="whitespace-nowrap"
              disabled={isPending}
              onClick={handleAdminConfirm}
            >
              {isPending ? "Confirming…" : "Confirm"}
            </Button>
          )}

          {isApprovedVehicleAwaitingAllocation && (
            <span className="text-xs font-medium text-primary whitespace-nowrap">
              Awaiting allocation
            </span>
          )}
        </div>

        <RejectionDialog
          open={rejectOpen}
          title={
            canAdminReview
              ? "Reject reservation request (Admin review)"
              : "Reject reservation request (Department approval)"
          }
          description="Provide a reason for rejecting this reservation request. This will be visible in the requester's audit timeline."
          pending={isPending}
          error={error}
          onCancel={() => {
            if (!isPending) setRejectOpen(false);
          }}
          onConfirm={handleConfirmRejection}
        />
      </div>
    );
  }

  return (
    <Card className="p-6 sm:p-8 space-y-6">
      <h2 className="section-title">
        {canAdminReview
          ? "Administrative review actions"
          : canHodDecide
          ? "Department Head approval"
          : isApprovedVehicleAwaitingAllocation
          ? "Vehicle & driver allocation pending"
          : "Final administrative confirmation"}
      </h2>

      {canAdminReview && (
        <p className="text-sm text-secondary">
          As an Administrator, review this request for institutional alignment. Forwarding will route this request to the Department Head for formal approval. If the request cannot proceed, you may reject it with an explanatory note.
        </p>
      )}

      {canHodDecide && (
        <p className="text-sm text-secondary">
          As the Department Head, review this reservation requested by your department member. You may approve the request to allow final scheduling, or reject it with an explanatory note.
        </p>
      )}

      {isApprovedVehicleAwaitingAllocation && (
        <Feedback tone="info">
          <strong>Vehicle & driver allocation required:</strong> This transport request has been approved. Assign an available vehicle and driver to complete the reservation.
        </Feedback>
      )}

      {canAdminConfirm && (
        <p className="text-sm text-secondary">
          This reservation has received Department Head approval. Click confirm to schedule the resource and finalize availability.
        </p>
      )}

      {error && (
        <Feedback tone="danger">
          {error}
        </Feedback>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        {canAdminReview && (
          <>
            <Button
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={handleAdminForward}
            >
              {isPending ? "Forwarding to HOD…" : "Forward to Department Head"}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setRejectOpen(true);
              }}
            >
              Reject request
            </Button>
          </>
        )}

        {canHodDecide && (
          <>
            <Button
              type="button"
              variant="primary"
              disabled={isPending}
              onClick={handleHodApprove}
            >
              {isPending ? "Approving request…" : "Approve request"}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setRejectOpen(true);
              }}
            >
              Reject request
            </Button>
          </>
        )}

        {canAdminConfirm && (
          <Button
            type="button"
            variant="primary"
            disabled={isPending}
            onClick={handleAdminConfirm}
          >
            {isPending ? "Confirming reservation…" : "Confirm reservation"}
          </Button>
        )}
      </div>

      <RejectionDialog
        open={rejectOpen}
        title={
          canAdminReview
            ? "Reject reservation request (Admin review)"
            : "Reject reservation request (Department approval)"
        }
        description="Provide a reason for rejecting this reservation request. This will be recorded in the audit trail and visible to the requester."
        pending={isPending}
        error={error}
        onCancel={() => {
          if (!isPending) setRejectOpen(false);
        }}
        onConfirm={handleConfirmRejection}
      />
    </Card>
  );
}
