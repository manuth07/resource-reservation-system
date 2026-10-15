"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { RateLimitError } from "@/lib/rate-limit";
import {
  createDriver,
  setDriverActiveStatus,
  updateDriver,
} from "@/lib/driver-service";
import type { DriverActionResult } from "@/lib/driver-types";
import { DriverError } from "@/lib/driver-validation";

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function failure(error: unknown): DriverActionResult {
  if (error instanceof DriverError) {
    return {
      success: false,
      error: error.message,
      ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}),
    };
  }
  if (error instanceof RateLimitError) {
    return { success: false, error: error.message };
  }
  if (error instanceof AuthorizationError) {
    return {
      success: false,
      error: "Your session cannot perform this operation. Sign in again or complete your password change.",
    };
  }
  return { success: false, error: "An unexpected error occurred. Please reload and try again." };
}

function invalidateDriverPaths(driverId?: string) {
  revalidatePath("/admin/drivers");
  revalidatePath("/admin/reservations");
  if (driverId) {
    revalidatePath(`/admin/drivers/${driverId}/edit`);
  }
}

export async function saveDriverAction(
  _previous: DriverActionResult,
  data: FormData,
): Promise<DriverActionResult> {
  const id = field(data, "id");
  const name = field(data, "name");
  const driverIdentifier = field(data, "driverIdentifier");
  const phone = field(data, "phone");
  const email = field(data, "email");

  let driverId: string;
  try {
    if (id) {
      const result = await updateDriver(id, {
        name,
        driverIdentifier,
        phone,
        email: email || null,
      });
      driverId = result.driverId;
    } else {
      const result = await createDriver({
        name,
        driverIdentifier,
        phone,
        email: email || null,
      });
      driverId = result.driverId;
    }
  } catch (error) {
    return failure(error);
  }

  invalidateDriverPaths(driverId);
  redirect("/admin/drivers");
}

export async function toggleDriverStatusAction(
  data: FormData,
): Promise<DriverActionResult> {
  const id = field(data, "id");
  const isActive = field(data, "isActive") === "true";

  try {
    const result = await setDriverActiveStatus(id, isActive);
    invalidateDriverPaths(result.driverId);
    return { success: true, driverId: result.driverId };
  } catch (error) {
    return failure(error);
  }
}
