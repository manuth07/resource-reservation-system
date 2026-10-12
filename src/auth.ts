import "server-only";

import NextAuth, { AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyEmployeeCredentials } from "@/lib/credentials";
import { UserRole } from "@/generated/prisma/enums";

const secret = process.env.AUTH_SECRET;
if (!secret?.trim() || Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("AUTH_SECRET must be configured with at least 32 random bytes.");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        employeeId: { label: "Employee ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: verifyEmployeeCredentials,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // Explicit allowlist: never copy the database record or client updates.
        return { sub: user.id, employeeId: user.employeeId, role: user.role, sessionVersion: user.sessionVersion };
      }
      if (!Number.isSafeInteger(token.sessionVersion) || token.sessionVersion < 0) return null;
      return token;
    },
    session({ session, token }) {
      if (
        !token.sub ||
        typeof token.employeeId !== "string" ||
        !Object.values(UserRole).includes(token.role) ||
        !Number.isSafeInteger(token.sessionVersion) || token.sessionVersion < 0
      ) {
        throw new Error("Invalid session claims.");
      }
      return {
        expires: session.expires,
        user: {
          id: token.sub,
          employeeId: token.employeeId,
          role: token.role,
          sessionVersion: token.sessionVersion,
        },
      };
    },
  },
  logger: {
    error(error) {
      // Avoid logging callback causes, request credentials, or database details.
      const type = error instanceof AuthError ? error.type : "UnknownError";
      if (type !== "CredentialsSignin") {
        console.error("[auth] Authentication error:", type);
      }
    },
  },
});
