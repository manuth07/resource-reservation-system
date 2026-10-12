import "server-only";

import { auth } from "@/auth";
import { AccountStatus, type UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export class AuthorizationError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "PASSWORD_CHANGE_REQUIRED" | "FORBIDDEN",
    public readonly status: 401 | 403,
  ) {
    super(code);
    this.name = "AuthorizationError";
  }
}

// Identity lookup only: this does NOT authorize normal application access.
// Deliberately uncached so each operation checks current PostgreSQL state.
export async function getAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      employeeId: true,
      role: true,
      departmentId: true,
      accountStatus: true,
      mustChangePassword: true,
    },
  });

  return user?.accountStatus === AccountStatus.ACTIVE ? user : null;
}

// Required entry point for ALL normal protected pages, actions, and services.
export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new AuthorizationError("UNAUTHENTICATED", 401);
  if (user.mustChangePassword) {
    throw new AuthorizationError("PASSWORD_CHANGE_REQUIRED", 403);
  }
  return user;
}

export async function requireRole(...roles: UserRole[]) {
  const user = await requireAuthenticatedUser();
  if (!roles.includes(user.role)) {
    throw new AuthorizationError("FORBIDDEN", 403);
  }
  return user;
}

// Use ONLY for the future first-login password-change flow. Logout is supplied
// by Auth.js and must remain available without passing normal-access guards.
export async function requirePasswordChangeUser() {
  const user = await getAuthenticatedUser();
  if (!user) throw new AuthorizationError("UNAUTHENTICATED", 401);
  if (!user.mustChangePassword) throw new AuthorizationError("FORBIDDEN", 403);
  return user;
}
