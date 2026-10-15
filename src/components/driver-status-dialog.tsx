"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleDriverStatusAction } from "@/app/driver-actions";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button, Feedback } from "@/components/ui";

type Props = {
  driverId: string;
  driverName: string;
  isActive: boolean;
  activeReservationCount?: number;
};

export function DriverStatusDialog({
  driverId,
  driverName,
  isActive,
  activeReservationCount = 0,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", driverId);
      formData.set("isActive", isActive ? "false" : "true");

      const result = await toggleDriverStatusAction(formData);
      if (result.success) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Failed to update driver status.");
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant={isActive ? "deactivate" : "activate"}
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {isActive ? "Deactivate" : "Activate"}
      </Button>

      <ConfirmationDialog
        open={open}
        title={isActive ? `Deactivate driver ${driverName}` : `Activate driver ${driverName}`}
        description={
          isActive ? (
            <div className="space-y-3 text-left">
              <p className="text-sm leading-relaxed text-secondary">
                Deactivating this driver prevents them from being assigned to any new or future vehicle reservations.
              </p>
              <p className="text-sm leading-relaxed text-secondary">
                All historical records are preserved.
              </p>
              {activeReservationCount > 0 && (
                <Feedback tone="warning" className="mt-3 text-left">
                  <strong>Active assignments notice:</strong> This driver is currently associated with{" "}
                  <strong>{activeReservationCount}</strong> active or upcoming reservation(s). Existing bookings will not be cancelled automatically.
                </Feedback>
              )}
            </div>
          ) : (
            `Activating ${driverName} will make them immediately available for vehicle reservation allocations.`
          )
        }
        confirmLabel={isActive ? "Deactivate driver" : "Activate driver"}
        pendingLabel={isActive ? "Deactivating…" : "Activating…"}
        pending={isPending}
        error={error ?? undefined}
        onCancel={() => {
          if (!isPending) setOpen(false);
        }}
        onConfirm={handleToggle}
      />
    </>
  );
}
