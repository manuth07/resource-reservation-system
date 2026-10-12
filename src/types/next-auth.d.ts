import type { UserRole } from "@/generated/prisma/enums";
import type {} from "@auth/core/jwt";

declare module "next-auth" {
  interface User {
    employeeId: string;
    role: UserRole;
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      employeeId: string;
      role: UserRole;
      sessionVersion: number;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    employeeId: string;
    role: UserRole;
    sessionVersion: number;
  }
}
