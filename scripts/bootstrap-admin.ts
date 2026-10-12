import "dotenv/config";

import { parseArgs } from "node:util";
import type { PrismaClient } from "../src/generated/prisma/client";
import { AdminBootstrapError, bootstrapInitialAdmin } from "./lib/admin-bootstrap";

async function main() {
  let prisma: PrismaClient | undefined;
  try {
    const { values } = parseArgs({
      options: {
        name: { type: "string" },
        email: { type: "string" },
        help: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });
    if (values.help) {
      process.stdout.write("Usage: npm run admin:bootstrap -- --name <name> --email <organizational-email>\nRun only in a private interactive terminal. Never redirect or record password output.\n");
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new AdminBootstrapError("Bootstrap requires a private interactive terminal; redirected or automated execution is refused.");
    }
    if (!values.name || !values.email) {
      throw new AdminBootstrapError("Supply --name and --email. Use --help for usage.");
    }

    // Load the exact existing singleton/adapter only after validating CLI usage.
    // The npm command enables the server-only package's react-server condition.
    ({ prisma } = await import("../src/lib/prisma"));
    const result = await bootstrapInitialAdmin(prisma, { name: values.name, email: values.email });
    process.stdout.write(
      `Administrator created: ${result.employeeId}\nTemporary password (shown once): ${result.temporaryPassword}\nSECRET: handle privately; never commit, redirect, or save this output to shared logs.\nA password change is required before normal application access.\n`,
    );
  } catch (error) {
    process.stderr.write(error instanceof AdminBootstrapError
      ? `${error.message}\n`
      : "Bootstrap failed. Check configuration, database availability, and unique field conflicts. Error details and credentials are suppressed.\n");
    process.exitCode = 1;
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        process.stderr.write("Database client cleanup failed; connection details are suppressed.\n");
        process.exitCode = 1;
      }
    }
  }
}

void main();
