"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { AccountOperationError, changeOwnPassword, createEmployee, resetEmployeeCredentials } from "@/lib/account-security";
import { AuthorizationError } from "@/lib/authorization";
import { RateLimitError } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/action-result";

function field(data: FormData, name: string) { const value = data.get(name); return typeof value === "string" ? value : ""; }
function message(error: unknown): string {
  if (error instanceof AccountOperationError || error instanceof RateLimitError) return error.message;
  if (error instanceof AuthorizationError) return "Your session cannot perform this operation. Sign in again or finish your password change.";
  return "The operation could not be completed. Please try again.";
}
export async function loginAction(_previous: ActionResult, data: FormData): Promise<ActionResult> {
  try { await signIn("credentials", { employeeId: field(data, "employeeId"), password: field(data, "password"), redirect: false }); }
  catch (error) {
    if (error instanceof AuthError) return { error: "Unable to sign in. Check your credentials or try again later." };
    return { error: "Unable to sign in. Please try again later." };
  }
  redirect("/dashboard");
}
export async function logoutAction() { await signOut({ redirectTo: "/login" }); }
export async function changePasswordAction(_previous: ActionResult, data: FormData): Promise<ActionResult> {
  try { await changeOwnPassword({ currentPassword: field(data, "currentPassword"), newPassword: field(data, "newPassword"), confirmPassword: field(data, "confirmPassword") }); }
  catch (error) { return { error: message(error) }; }
  await signOut({ redirectTo: "/login?password=changed" });
  return {};
}
export async function createEmployeeAction(data: FormData): Promise<ActionResult> {
  try { return { credentials: await createEmployee({ employeeId: field(data, "employeeId"), name: field(data, "name"), email: field(data, "email"), departmentId: field(data, "departmentId"), role: field(data, "role") }) }; }
  catch (error) { return { error: message(error) }; }
}
export async function resetEmployeeAction(data: FormData): Promise<ActionResult> {
  try { return { credentials: await resetEmployeeCredentials(field(data, "userId")) }; }
  catch (error) { return { error: message(error) }; }
}
