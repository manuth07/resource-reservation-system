"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Feedback } from "@/components/ui";
import { adminAllocateVehicleAndConfirmAction } from "@/app/reservation-actions";

export type VehicleAllocationPanelProps = {
  reservationId: string;
  categoryName: string;
  passengerCount: number | null;
  destination: string | null;
  purpose: string;
  dateStr: string;
  timeIntervalStr: string;
  availableVehicles: Array<{
    id: string;
    name: string;
    resourceCode: string;
    capacity: number | null;
  }>;
  availableDrivers: Array<{
    id: string;
    name: string;
    driverIdentifier: string;
  }>;
};

export function VehicleAllocationPanel({
  reservationId,
  categoryName,
  passengerCount,
  destination,
  purpose,
  dateStr,
  timeIntervalStr,
  availableVehicles,
  availableDrivers,
}: VehicleAllocationPanelProps) {
  const router = useRouter();
  const idPrefix = useId();
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasVehicles = availableVehicles.length > 0;
  const hasDrivers = availableDrivers.length > 0;
  const canAllocate = hasVehicles && hasDrivers;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;
    setError(null);

    if (!vehicleId) {
      setError("Please select an eligible vehicle to allocate.");
      return;
    }
    if (!driverId) {
      setError("Please select an active driver to allocate.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("reservationId", reservationId);
      formData.set("vehicleId", vehicleId);
      formData.set("driverId", driverId);

      const result = await adminAllocateVehicleAndConfirmAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        router.push(`${window.location.pathname}?allocated=1`);
        router.refresh();
      }
    });
  };

  return (
    <section id="allocate" aria-label="Vehicle and driver allocation">
      <Card className="p-6 sm:p-8 space-y-6 border-l-4 border-l-primary">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-4">
        <div>
          <h2 className="section-title">Allocate vehicle and driver</h2>
          <p className="mt-1 text-sm text-secondary">
            Select an eligible fleet vehicle and an available driver to complete final confirmation.
          </p>
        </div>
        <span className="inline-block self-start rounded border border-info/30 bg-info-surface px-2.5 py-1 text-xs font-semibold text-info">
          Administrative Action
        </span>
      </div>

      {/* Specifications Summary */}
      <div className="rounded border border-border bg-table-header p-4 space-y-3 text-sm">
        <h3 className="font-semibold text-foreground text-xs uppercase tracking-wider">
          Request parameters
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-secondary">Requested category</dt>
            <dd className="font-medium text-foreground">{categoryName}</dd>
          </div>
          <div>
            <dt className="text-xs text-secondary">Passengers required</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {passengerCount ? `${passengerCount} passengers` : "Not specified"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-secondary">Date & interval</dt>
            <dd className="font-medium text-foreground tabular-nums">
              {dateStr}, {timeIntervalStr}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-secondary">Destination</dt>
            <dd className="font-medium text-foreground">{destination ?? "Not specified"}</dd>
          </div>
        </dl>
        <div>
          <span className="text-xs text-secondary">Stated purpose: </span>
          <span className="text-xs text-foreground italic">{purpose}</span>
        </div>
      </div>

      {/* Availability Warnings */}
      {!hasVehicles && (
        <Feedback tone="warning">
          No eligible vehicles in category &ldquo;{categoryName}&rdquo; are currently available for this time slot
          {passengerCount ? ` with capacity for ${passengerCount} passengers` : ""}.
          Allocation cannot proceed until a vehicle is free or added.
        </Feedback>
      )}

      {!hasDrivers && (
        <Feedback tone="warning">
          No active drivers are available for this time slot. Allocation cannot proceed until a driver is free.
        </Feedback>
      )}

      {error && (
        <Feedback tone="danger">
          {error}
        </Feedback>
      )}

      {/* Allocation Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Vehicle Select */}
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-vehicle`} className="form-label">
              Assigned vehicle <span className="supporting-text">(required)</span>
            </label>
            <select
              id={`${idPrefix}-vehicle`}
              name="vehicleId"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                if (error) setError(null);
              }}
              disabled={isPending || !hasVehicles}
              className="field w-full text-sm"
              required
            >
              <option value="">— Select an available vehicle —</option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  [{v.resourceCode}] {v.name} (Capacity: {v.capacity ? `${v.capacity} seats` : "unspecified"})
                </option>
              ))}
            </select>
            <p className="text-xs text-secondary">
              Only active vehicles matching category &ldquo;{categoryName}&rdquo; with sufficient passenger capacity and no scheduling conflicts are listed.
            </p>
          </div>

          {/* Driver Select */}
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-driver`} className="form-label">
              Assigned driver <span className="supporting-text">(required)</span>
            </label>
            <select
              id={`${idPrefix}-driver`}
              name="driverId"
              value={driverId}
              onChange={(e) => {
                setDriverId(e.target.value);
                if (error) setError(null);
              }}
              disabled={isPending || !hasDrivers}
              className="field w-full text-sm"
              required
            >
              <option value="">— Select an available driver —</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} (ID: {d.driverIdentifier})
                </option>
              ))}
            </select>
            <p className="text-xs text-secondary">
              Only active drivers without overlapping confirmed assignments are listed.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-border">
          <Button
            type="submit"
            variant="primary"
            disabled={isPending || !canAllocate || !vehicleId || !driverId}
          >
            {isPending ? "Allocating and confirming…" : "Confirm allocation & reservation"}
          </Button>
        </div>
      </form>
    </Card>
  </section>
);
}
