"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { RateLimitError } from "@/lib/rate-limit";
import {
  adminFinalConfirm,
  adminForwardToHod,
  adminRejectRequest,
  cancelReservation,
  checkResourceAvailability,
  createDirectReservation,
  createReservationRequest,
  hodApproveRequest,
  hodRejectRequest,
} from "@/lib/reservation-service";
import type { ReservationActionResult } from "@/lib/reservation-types";
import {
  ReservationError,
  parseColomboDateTime,
  validateBookingInterval,
} from "@/lib/reservation-validation";

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function failure(error: unknown): ReservationActionResult {
  if (error instanceof ReservationError) {
    return {
      error: error.message,
      ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}),
    };
  }
  if (error instanceof RateLimitError) {
    return { error: error.message };
  }
  if (error instanceof AuthorizationError) {
    return {
      error: "Your session cannot perform this operation. Sign in again or complete your password change.",
    };
  }
  return { error: "An unexpected error occurred. Please reload and try again." };
}

function invalidateAllReservationPaths(id?: string) {
  revalidatePath("/reservations");
  revalidatePath("/dashboard");
  revalidatePath("/admin/reservations");
  revalidatePath("/department/approvals");
  if (id) {
    revalidatePath(`/reservations/${id}`);
  }
}

export async function createDirectBookingAction(
  _previous: ReservationActionResult,
  data: FormData,
): Promise<ReservationActionResult> {
  let reservationId: string;
  const resourceId = field(data, "resourceId");

  try {
    const result = await createDirectReservation({
      resourceId,
      date: field(data, "date"),
      startTime: field(data, "startTime"),
      endTime: field(data, "endTime"),
      purpose: field(data, "purpose"),
    });
    reservationId = result.reservationId;
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(reservationId);
  if (resourceId) {
    revalidatePath(`/resources/${resourceId}`);
  }

  redirect(`/reservations/${reservationId}?created=1`);
}

export async function createReservationRequestAction(
  _previous: ReservationActionResult,
  data: FormData,
): Promise<ReservationActionResult> {
  let reservationId: string;
  const resourceId = field(data, "resourceId");

  try {
    const result = await createReservationRequest({
      resourceId,
      date: field(data, "date"),
      startTime: field(data, "startTime"),
      endTime: field(data, "endTime"),
      purpose: field(data, "purpose"),
    });
    reservationId = result.reservationId;
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(reservationId);
  if (resourceId) {
    revalidatePath(`/resources/${resourceId}`);
  }

  redirect(`/reservations/${reservationId}?requested=1`);
}

export async function cancelReservationAction(
  data: FormData,
): Promise<ReservationActionResult> {
  const id = field(data, "id");
  try {
    await cancelReservation(id);
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(id);
  return { reservationId: id };
}

export async function adminForwardAction(
  data: FormData,
): Promise<ReservationActionResult> {
  const id = field(data, "id");
  try {
    await adminForwardToHod(id);
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(id);
  return { reservationId: id };
}

export async function adminRejectAction(
  data: FormData,
): Promise<ReservationActionResult> {
  const id = field(data, "id");
  const rejectionReason = field(data, "rejectionReason");
  try {
    await adminRejectRequest(id, rejectionReason);
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(id);
  return { reservationId: id };
}

export async function hodApproveAction(
  data: FormData,
): Promise<ReservationActionResult> {
  const id = field(data, "id");
  try {
    await hodApproveRequest(id);
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(id);
  return { reservationId: id };
}

export async function hodRejectAction(
  data: FormData,
): Promise<ReservationActionResult> {
  const id = field(data, "id");
  const rejectionReason = field(data, "rejectionReason");
  try {
    await hodRejectRequest(id, rejectionReason);
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(id);
  return { reservationId: id };
}

export async function adminFinalConfirmAction(
  data: FormData,
): Promise<ReservationActionResult> {
  const id = field(data, "id");
  try {
    await adminFinalConfirm(id);
  } catch (error) {
    return failure(error);
  }

  invalidateAllReservationPaths(id);
  return { reservationId: id };
}

export async function checkAvailabilityAction(
  resourceId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<{ available: boolean; error?: string }> {
  try {
    const start = parseColomboDateTime(date, startTime, "startTime");
    const end = parseColomboDateTime(date, endTime, "endTime");
    validateBookingInterval(start, end);
    const result = await checkResourceAvailability(resourceId, start, end);
    if (!result.available) {
      return {
        available: false,
        error: "This room is already booked for the selected time. Choose another time slot.",
      };
    }
    return { available: true };
  } catch (error) {
    if (error instanceof ReservationError) {
      return { available: false, error: error.message };
    }
    return { available: false, error: "Unable to check availability." };
  }
}
