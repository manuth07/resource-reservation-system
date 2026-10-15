import { ReservationStatus } from "@/generated/prisma/enums";
import type {
  DirectBookingInput,
  DisplayReservationStatus,
  ReservationField,
} from "@/lib/reservation-types";

export const COLOMBO_TIMEZONE = "Asia/Colombo";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class ReservationError extends Error {
  constructor(
    message: string,
    public readonly field?: ReservationField,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

/**
 * Returns the derived display status.
 * COMPLETED is not stored in the database; it is derived when
 * a CONFIRMED reservation has elapsed past its endTime.
 */
export function getDisplayReservationStatus(
  status: ReservationStatus,
  endTime: Date | string,
  now: Date = new Date(),
): DisplayReservationStatus {
  if (status === ReservationStatus.CONFIRMED) {
    const end = typeof endTime === "string" ? new Date(endTime) : endTime;
    if (end.getTime() <= now.getTime()) {
      return "COMPLETED";
    }
  }
  return status;
}

/**
 * Parses date string (YYYY-MM-DD) and time string (HH:mm) into a UTC Date object
 * assuming the organization's standard timezone (Asia/Colombo, UTC+05:30).
 */
export function parseColomboDateTime(
  dateStr: string,
  timeStr: string,
  fieldPrefix: "startTime" | "endTime" = "startTime",
): Date {
  if (!DATE_REGEX.test(dateStr)) {
    throw new ReservationError("A valid date in YYYY-MM-DD format is required.", "date");
  }
  if (!TIME_REGEX.test(timeStr)) {
    throw new ReservationError("A valid time in HH:mm format is required.", fieldPrefix);
  }

  // Construct ISO string with explicit Colombo (+05:30) offset
  const isoWithOffset = `${dateStr}T${timeStr}:00+05:30`;
  const parsed = new Date(isoWithOffset);

  if (Number.isNaN(parsed.getTime())) {
    throw new ReservationError("Invalid date or time value.", fieldPrefix);
  }

  return parsed;
}

/**
 * Validates that an interval is non-past and that startTime < endTime.
 */
export function validateBookingInterval(
  start: Date,
  end: Date,
  now: Date = new Date(),
): void {
  if (start.getTime() >= end.getTime()) {
    throw new ReservationError(
      "End time must be after start time.",
      "endTime",
    );
  }

  // Allow a small grace margin of 60 seconds for clock skew / submission latency
  const graceMarginMs = 60 * 1000;
  if (start.getTime() < now.getTime() - graceMarginMs) {
    throw new ReservationError(
      "Reservation start time cannot be in the past.",
      "startTime",
    );
  }
}

/**
 * Parses and validates direct booking submission input.
 */
export function parseDirectBookingInput(
  raw: Record<string, unknown>,
  now: Date = new Date(),
): DirectBookingInput & { start: Date; end: Date } {
  const resourceId = typeof raw.resourceId === "string" ? raw.resourceId.trim() : "";
  if (!isValidUuid(resourceId)) {
    throw new ReservationError("A valid resource selection is required.", "resourceId");
  }

  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  if (!DATE_REGEX.test(date)) {
    throw new ReservationError("Please provide a valid booking date (YYYY-MM-DD).", "date");
  }

  const startTime = typeof raw.startTime === "string" ? raw.startTime.trim() : "";
  if (!TIME_REGEX.test(startTime)) {
    throw new ReservationError("Please provide a valid start time (HH:mm).", "startTime");
  }

  const endTime = typeof raw.endTime === "string" ? raw.endTime.trim() : "";
  if (!TIME_REGEX.test(endTime)) {
    throw new ReservationError("Please provide a valid end time (HH:mm).", "endTime");
  }

  const purpose = typeof raw.purpose === "string" ? raw.purpose.trim() : "";
  if (!purpose) {
    throw new ReservationError("Purpose is required for this reservation.", "purpose");
  }
  if (purpose.length > 1000) {
    throw new ReservationError("Purpose must not exceed 1000 characters.", "purpose");
  }

  const start = parseColomboDateTime(date, startTime, "startTime");
  const end = parseColomboDateTime(date, endTime, "endTime");

  validateBookingInterval(start, end, now);

  return {
    resourceId,
    date,
    startTime,
    endTime,
    purpose,
    start,
    end,
  };
}

/**
 * Formats a Date or UTC ISO string into Asia/Colombo localized date & time.
 * Example: "14 Oct 2026, 09:30 AM"
 */
export function formatColomboDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: COLOMBO_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Formats a Date or UTC ISO string into Asia/Colombo localized date.
 * Example: "14 Oct 2026"
 */
export function formatColomboDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: COLOMBO_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Formats a Date or UTC ISO string into Asia/Colombo localized time.
 * Example: "09:30 AM"
 */
export function formatColomboTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: COLOMBO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Extracts YYYY-MM-DD in Asia/Colombo timezone.
 */
export function getColomboDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/**
 * Validates a passenger count.
 * Must be a positive integer greater than zero when provided.
 */
export function validatePassengerCount(value: unknown, required = false): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new ReservationError("Passenger count is required for transport requests.", "passengerCount");
    }
    return null;
  }
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ReservationError("Passenger count must be a positive number.", "passengerCount");
  }
  if (num > 200) {
    throw new ReservationError("Passenger count exceeds maximum vehicle capacity.", "passengerCount");
  }
  return num;
}
