"use client";

import { useState, useTransition } from "react";
import { cancelReservationAction } from "@/app/reservation-actions";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button, Feedback } from "@/components/ui";

export function ReservationCancelControl({ reservationId }: { reservationId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", reservationId);
      const result = await cancelReservationAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  };

  return (
    <div>
      {error && !open && <Feedback tone="danger" className="mb-4">{error}</Feedback>}
      <Button
        type="button"
        variant="danger"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Cancel reservation
      </Button>

      <ConfirmationDialog
        open={open}
        title="Cancel reservation"
        description="Are you sure you want to cancel this reservation? The reserved resource will immediately become available for other employees to book."
        confirmLabel="Confirm cancellation"
        pendingLabel="Cancelling…"
        pendingMessage="Cancelling reservation. Please wait."
        pending={isPending}
        error={error ?? undefined}
        onCancel={() => {
          if (!isPending) setOpen(false);
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
