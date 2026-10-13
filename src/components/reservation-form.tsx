"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { NavigationLink as Link } from "@/components/navigation-link";
import {
  checkAvailabilityAction,
  createDirectBookingAction,
} from "@/app/reservation-actions";
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

type EligibleResourceProp = {
  id: string;
  name: string;
  resourceCode: string;
  location: string | null;
  capacity: number | null;
  category: {
    id: string;
    name: string;
    code: string;
    isVehicle: boolean;
  };
};

export function ReservationForm({ resource }: { resource: EligibleResourceProp }) {
  const [state, action, pending] = useActionState(
    createDirectBookingAction,
    {} as ReservationActionResult,
  );
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  useValidationFocus(form, state.fieldErrors, !pending);

  const todayStr = getColomboDateString();

  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [purpose, setPurpose] = useState("");

  const [availabilityState, setAvailabilityState] = useState<{
    checked: boolean;
    available: boolean;
    message?: string;
  }>({ checked: false, available: false });
  const [isChecking, startCheckingTransition] = useTransition();

  const errors = state.fieldErrors ?? {};

  const handleCheckAvailability = () => {
    if (!date || !startTime || !endTime) {
      setAvailabilityState({
        checked: true,
        available: false,
        message: "Please enter date, start time, and end time to check availability.",
      });
      return;
    }

    startCheckingTransition(async () => {
      const res = await checkAvailabilityAction(resource.id, date, startTime, endTime);
      if (res.available) {
        setAvailabilityState({
          checked: true,
          available: true,
          message: "Slot is available for booking.",
        });
      } else {
        setAvailabilityState({
          checked: true,
          available: false,
          message: res.error ?? "Resource is already reserved during this time interval.",
        });
      }
    });
  };

  const handleTimeChange = (type: "date" | "start" | "end", val: string) => {
    if (type === "date") setDate(val);
    if (type === "start") setStartTime(val);
    if (type === "end") setEndTime(val);
    // Reset checked status when times change
    if (availabilityState.checked) {
      setAvailabilityState({ checked: false, available: false });
    }
  };

  return (
    <div className="space-y-6">
      {/* Resource overview panel */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CategoryBadge category={resource.category} />
              <span className="font-mono text-xs text-secondary">{resource.resourceCode}</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-foreground">{resource.name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-secondary">
              {resource.location && <span>Location: <strong className="text-foreground">{resource.location}</strong></span>}
              {resource.capacity && <span>Capacity: <strong className="text-foreground tabular-nums">{resource.capacity} people</strong></span>}
              <span>Policy: <strong className="text-foreground">Direct booking (immediate confirmation)</strong></span>
            </div>
          </div>
        </div>
      </Card>

      {/* Booking form */}
      <Card className="p-6 sm:p-8">
        <form
          ref={form}
          action={action}
          onSubmit={(e) => {
            if (!submission.acquire()) {
              e.preventDefault();
            }
          }}
          className="space-y-6"
        >
          <input type="hidden" name="resourceId" value={resource.id} />

          {state.error && <Feedback tone="danger">{state.error}</Feedback>}

          <div className="rounded border border-border bg-table-header p-4 text-xs text-secondary">
            <p className="font-medium text-foreground">Timezone notice</p>
            <p className="mt-1">
              All reservations are scheduled according to organizational headquarters time (
              <strong>{COLOMBO_TIMEZONE}</strong>, UTC+05:30).
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <FormField
              id="date"
              label="Booking date"
              required
              error={errors.date}
              hint="Format: YYYY-MM-DD"
            >
              <Input
                id="date"
                name="date"
                type="date"
                required
                min={todayStr}
                value={date}
                onChange={(e) => handleTimeChange("date", e.target.value)}
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? "date-error" : "date-hint"}
              />
            </FormField>

            <FormField
              id="startTime"
              label="Start time"
              required
              error={errors.startTime}
              hint="Format: HH:mm (24-hour)"
            >
              <Input
                id="startTime"
                name="startTime"
                type="time"
                required
                value={startTime}
                onChange={(e) => handleTimeChange("start", e.target.value)}
                aria-invalid={!!errors.startTime}
                aria-describedby={errors.startTime ? "startTime-error" : "startTime-hint"}
              />
            </FormField>

            <FormField
              id="endTime"
              label="End time"
              required
              error={errors.endTime}
              hint="Format: HH:mm (24-hour)"
            >
              <Input
                id="endTime"
                name="endTime"
                type="time"
                required
                value={endTime}
                onChange={(e) => handleTimeChange("end", e.target.value)}
                aria-invalid={!!errors.endTime}
                aria-describedby={errors.endTime ? "endTime-error" : "endTime-hint"}
              />
            </FormField>
          </div>

          {/* Availability check helper */}
          <div className="flex flex-wrap items-center gap-4 rounded border border-border p-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isChecking || pending}
              onClick={handleCheckAvailability}
            >
              {isChecking ? "Checking availability…" : "Check slot availability"}
            </Button>
            {availabilityState.checked && (
              <span
                role="status"
                className={`text-sm ${
                  availabilityState.available ? "text-success font-medium" : "text-danger"
                }`}
              >
                {availabilityState.message}
              </span>
            )}
          </div>

          <FormField
            id="purpose"
            label="Reservation purpose"
            required
            error={errors.purpose}
            hint={`State the business purpose for reserving this resource. (${1000 - purpose.length} characters remaining)`}
          >
            <textarea
              id="purpose"
              name="purpose"
              required
              rows={4}
              maxLength={1000}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="field min-h-24 resize-y"
              aria-invalid={!!errors.purpose}
              aria-describedby={errors.purpose ? "purpose-error" : "purpose-hint"}
              placeholder="e.g. Q4 Department Planning Meeting with regional directors"
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <Link
              href={`/resources/${resource.id}`}
              className="button button-secondary"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Confirming reservation…" : "Confirm direct reservation"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
