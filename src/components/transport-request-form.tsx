"use client";

import { useActionState, useRef, useState } from "react";
import { NavigationLink as Link } from "@/components/navigation-link";
import { createVehicleRequestAction } from "@/app/reservation-actions";
import {
  Button,
  Card,
  CategoryBadge,
  Feedback,
  FormField,
  Input,
} from "@/components/ui";
import { useSubmissionLock } from "@/components/use-submission-lock";
import { useValidationFocus } from "@/components/use-validation-focus";
import type { ReservationActionResult } from "@/lib/reservation-types";
import { COLOMBO_TIMEZONE, getColomboDateString } from "@/lib/reservation-validation";

export type VehicleCategoryOption = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isVehicle: boolean;
};

export function TransportRequestForm({
  categories,
  initialCategoryId = "",
}: {
  categories: VehicleCategoryOption[];
  initialCategoryId?: string;
}) {
  const [state, action, pending] = useActionState(
    createVehicleRequestAction,
    {} as ReservationActionResult,
  );
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  useValidationFocus(form, state.fieldErrors, !pending);

  const todayStr = getColomboDateString();

  const [selectedCategoryId, setSelectedCategoryId] = useState(
    initialCategoryId || (categories.length === 1 ? categories[0].id : ""),
  );
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [destination, setDestination] = useState("");
  const [passengerCount, setPassengerCount] = useState("1");
  const [purpose, setPurpose] = useState("");

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const errors = state.fieldErrors ?? {};

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!submission.acquire()) {
      event.preventDefault();
    }
  };

  return (
    <div className="space-y-6">
      {/* Transport specification guidance card */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
              Transport reservation policy
            </span>
          </div>
          {selectedCategory && (
            <CategoryBadge category={selectedCategory} />
          )}
        </div>

        <p className="text-sm text-secondary">
          Employees request transport by <strong>vehicle category</strong> (such as Van or Car), rather than reserving individual vehicles. A specific vehicle and driver will be allocated by the transport administrator following organizational approval.
        </p>

        <div className="rounded border border-border bg-table-header p-3 text-xs text-secondary">
          <span className="font-semibold text-foreground">Approval workflow: </span>
          <span>
            Employee Request → Administrator Review → Department Head Decision → Final Vehicle & Driver Allocation.
          </span>
        </div>
      </Card>

      {/* Main Request Form */}
      <Card className="p-6 sm:p-8">
        <form
          ref={form}
          action={action}
          onSubmit={handleSubmit}
          className="space-y-6"
          noValidate
        >
          {state.error && (
            <Feedback tone="danger">
              {state.error}
            </Feedback>
          )}

          {/* Vehicle Category Selector */}
          <FormField
            id="categoryId"
            label="Vehicle category"
            required
            hint="Choose the class of transport required for your journey."
            error={errors.requestedCategoryId}
          >
            <div className="select-control">
              <select
                id="categoryId"
                name="categoryId"
                className="field w-full"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                disabled={pending}
                required
                aria-invalid={!!errors.requestedCategoryId}
              >
                <option value="">— Select a vehicle category —</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.code})
                  </option>
                ))}
              </select>
            </div>
          </FormField>

          {selectedCategory?.description && (
            <p className="text-xs text-secondary -mt-3">
              {selectedCategory.description}
            </p>
          )}

          {/* Date Selection */}
          <FormField
            id="date"
            label="Travel date"
            required
            hint={`Scheduled according to ${COLOMBO_TIMEZONE} time.`}
            error={errors.date}
          >
            <Input
              id="date"
              name="date"
              type="date"
              min={todayStr}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
              required
              aria-invalid={!!errors.date}
            />
          </FormField>

          {/* Time Interval: Start & End Time */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FormField
              id="startTime"
              label="Departure time"
              required
              hint={`Asia/Colombo (${COLOMBO_TIMEZONE})`}
              error={errors.startTime}
            >
              <Input
                id="startTime"
                name="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={pending}
                required
                aria-invalid={!!errors.startTime}
              />
            </FormField>

            <FormField
              id="endTime"
              label="Return time"
              required
              hint={`Asia/Colombo (${COLOMBO_TIMEZONE})`}
              error={errors.endTime}
            >
              <Input
                id="endTime"
                name="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={pending}
                required
                aria-invalid={!!errors.endTime}
              />
            </FormField>
          </div>

          {/* Destination */}
          <FormField
            id="destination"
            label="Destination"
            required
            hint="Specify journey destination, client site, or route details."
            error={errors.destination}
          >
            <Input
              id="destination"
              name="destination"
              type="text"
              placeholder="e.g., Client Office, Colombo 03, BIA Airport, Field Office"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={pending}
              maxLength={500}
              required
              aria-invalid={!!errors.destination}
            />
          </FormField>

          {/* Passenger Count */}
          <FormField
            id="passengerCount"
            label="Passenger count"
            required
            hint="Total number of staff members travelling (must be greater than 0)."
            error={errors.passengerCount}
          >
            <Input
              id="passengerCount"
              name="passengerCount"
              type="number"
              min="1"
              max="200"
              step="1"
              placeholder="e.g., 4"
              value={passengerCount}
              onChange={(e) => setPassengerCount(e.target.value)}
              disabled={pending}
              required
              aria-invalid={!!errors.passengerCount}
            />
          </FormField>

          {/* Purpose */}
          <FormField
            id="purpose"
            label="Business purpose"
            required
            hint={`State the official business purpose for this transport request. (${1000 - purpose.length} characters remaining)`}
            error={errors.purpose}
          >
            <textarea
              id="purpose"
              name="purpose"
              rows={4}
              className="field w-full resize-y text-sm"
              placeholder="Explain the operational purpose for this vehicle request (e.g., Site survey, Client executive consultation, Equipment transport)…"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              disabled={pending}
              maxLength={1000}
              required
              aria-invalid={!!errors.purpose}
            />
          </FormField>

          {/* Submit Actions */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
            <Link
              href="/resources"
              className="button button-secondary"
            >
              Cancel
            </Link>
            <Button
              type="submit"
              variant="primary"
              disabled={pending || !selectedCategoryId}
            >
              {pending ? "Submitting request…" : "Submit transport request"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
