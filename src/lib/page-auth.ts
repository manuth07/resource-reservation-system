import "server-only";
import { redirect } from "next/navigation";
import { AuthorizationError, requireAuthenticatedUser, requireRole } from "@/lib/authorization";
import type { UserRole } from "@/generated/prisma/enums";
export async function requirePageUser(...roles: UserRole[]) {
  try { return roles.length ? await requireRole(...roles) : await requireAuthenticatedUser(); }
  catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    if (error.code === "PASSWORD_CHANGE_REQUIRED") redirect("/change-password");
    if (error.code === "FORBIDDEN") redirect("/dashboard");
    redirect("/login");
  }
}
