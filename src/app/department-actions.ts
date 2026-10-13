"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/enums";
import { AuthorizationError } from "@/lib/authorization";
import { RateLimitError } from "@/lib/rate-limit";
import {
  createDepartment,
  designateDepartmentHead,
  promoteAndDesignateHead,
  transferEmployee,
  updateDepartment,
} from "@/lib/department-service";
import type { DepartmentActionResult } from "@/lib/department-types";
import { DepartmentError } from "@/lib/department-validation";

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function failure(error: unknown): DepartmentActionResult {
  if (error instanceof DepartmentError) {
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

function invalidateDepartmentPaths(departmentId?: string) {
  revalidatePath("/admin/departments");
  revalidatePath("/admin/employees");
  revalidatePath("/department/approvals");
  revalidatePath("/admin/reservations");
  if (departmentId) {
    revalidatePath(`/admin/departments/${departmentId}/edit`);
  }
}

export async function saveDepartmentAction(
  _previous: DepartmentActionResult,
  data: FormData,
): Promise<DepartmentActionResult> {
  const id = field(data, "id");
  const name = field(data, "name");
  const code = field(data, "code");
  const description = field(data, "description");

  let departmentId: string;

  try {
    if (id) {
      const res = await updateDepartment({
        id,
        name,
        code,
        description: description || null,
      });
      departmentId = res.departmentId;
    } else {
      const res = await createDepartment({
        name,
        code,
        description: description || null,
      });
      departmentId = res.departmentId;
    }
  } catch (error) {
    return failure(error);
  }

  invalidateDepartmentPaths(departmentId);
  redirect("/admin/departments?saved=1");
}

export async function designateDepartmentHeadAction(
  data: FormData,
): Promise<DepartmentActionResult> {
  const departmentId = field(data, "departmentId");
  const headIdRaw = field(data, "headId");
  const headId = headIdRaw === "" || headIdRaw === "unassign" ? null : headIdRaw;

  try {
    await designateDepartmentHead(departmentId, headId);
  } catch (error) {
    return failure(error);
  }

  invalidateDepartmentPaths(departmentId);
  return { departmentId };
}

export async function promoteAndDesignateHeadAction(
  data: FormData,
): Promise<DepartmentActionResult> {
  const departmentId = field(data, "departmentId");
  const userId = field(data, "userId");

  try {
    await promoteAndDesignateHead(departmentId, userId);
  } catch (error) {
    return failure(error);
  }

  invalidateDepartmentPaths(departmentId);
  return { departmentId };
}

export async function transferEmployeeAction(
  data: FormData,
): Promise<DepartmentActionResult> {
  const userId = field(data, "userId");
  const targetDepartmentId = field(data, "targetDepartmentId");
  const roleRaw = field(data, "role");

  const newRole =
    roleRaw === "DEPARTMENT_HEAD"
      ? UserRole.DEPARTMENT_HEAD
      : roleRaw === "EMPLOYEE"
      ? UserRole.EMPLOYEE
      : undefined;

  try {
    await transferEmployee({
      userId,
      targetDepartmentId,
      newRole,
    });
  } catch (error) {
    return failure(error);
  }

  invalidateDepartmentPaths(targetDepartmentId);
  return { departmentId: targetDepartmentId };
}
