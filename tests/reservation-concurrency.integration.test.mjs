import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash, argon2id } from "argon2";

const url = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL GiST exclusion constraint concurrency and adjacent reservation protection (rollback only)",
  { skip: !url },
  async () => {
    try {
      const target = new URL(url);
      assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
      assert.match(decodeURIComponent(target.pathname), /_test$/);
      if (process.env.DATABASE_URL) {
        const main = new URL(process.env.DATABASE_URL);
        assert.notEqual(
          `${target.hostname}:${target.port || "5432"}${target.pathname}`,
          `${main.hostname}:${main.port || "5432"}${main.pathname}`,
        );
      }
    } catch {
      throw new Error(
        "Export a distinct dedicated PostgreSQL URL ending in _test; inspect configuration privately.",
      );
    }

    const jiti = createJiti(import.meta.url, {
      alias: {
        "server-only": fileURLToPath(
          new URL("../node_modules/server-only/empty.js", import.meta.url),
        ),
      },
    });

    const { PrismaClient } = await jiti.import(
      fileURLToPath(new URL("../src/generated/prisma/client.ts", import.meta.url)),
    );
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    const rollback = new Error("Intentional fixture rollback");

    try {
      await client.$transaction(
        async (tx) => {
          const suffix = randomUUID().replaceAll("-", "");
          const department = await tx.department.create({
            data: { code: `ENG_${suffix}`, name: `Engineering ${suffix}` },
          });

          const user = await tx.user.create({
            data: {
              employeeId: `EMP_${suffix}`,
              email: `${suffix}@example.invalid`,
              name: "Concurrency Test Employee",
              departmentId: department.id,
              role: "EMPLOYEE",
              accountStatus: "ACTIVE",
              mustChangePassword: false,
              passwordHash: await hash("Test-password-2026", { type: argon2id }),
            },
          });

          const category = await tx.resourceCategory.create({
            data: {
              code: `MEET_${suffix}`,
              name: `Meeting Rooms ${suffix}`,
              isVehicle: false,
            },
          });

          const resource = await tx.resource.create({
            data: {
              name: `Room ${suffix}`,
              resourceCode: `RM_${suffix}`,
              categoryId: category.id,
              capacity: 8,
              isActive: true,
              requiresApproval: false,
            },
          });

          const start1 = new Date("2030-06-01T09:00:00.000Z");
          const end1 = new Date("2030-06-01T10:00:00.000Z");

          // 1. Initial confirmed booking
          const first = await tx.reservation.create({
            data: {
              requesterId: user.id,
              departmentId: department.id,
              requestedCategoryId: category.id,
              resourceId: resource.id,
              startTime: start1,
              endTime: end1,
              purpose: "Initial team standup",
              status: "CONFIRMED",
            },
          });
          assert.ok(first.id);

          // 2. Immediately adjacent booking [10:00, 11:00) should SUCCEED (half-open range [))
          const start2 = new Date("2030-06-01T10:00:00.000Z");
          const end2 = new Date("2030-06-01T11:00:00.000Z");
          const adjacent = await tx.reservation.create({
            data: {
              requesterId: user.id,
              departmentId: department.id,
              requestedCategoryId: category.id,
              resourceId: resource.id,
              startTime: start2,
              endTime: end2,
              purpose: "Adjacent team retrospective",
              status: "CONFIRMED",
            },
          });
          assert.ok(adjacent.id);

          // 3. Overlapping booking [09:30, 10:30) MUST FAIL against PostgreSQL GiST exclusion
          const startOverlap = new Date("2030-06-01T09:30:00.000Z");
          const endOverlap = new Date("2030-06-01T10:30:00.000Z");

          await assert.rejects(
            tx.reservation.create({
              data: {
                requesterId: user.id,
                departmentId: department.id,
                requestedCategoryId: category.id,
                resourceId: resource.id,
                startTime: startOverlap,
                endTime: endOverlap,
                purpose: "Conflicting meeting",
                status: "CONFIRMED",
              },
            }),
            (err) => {
              const msg = String(err?.message ?? err);
              const code = err?.code;
              return (
                code === "23P01" ||
                msg.includes("23P01") ||
                msg.includes("Reservation_confirmed_resource_no_overlap")
              );
            },
          );

          throw rollback;
        },
        { timeout: 30000 },
      );
    } catch (error) {
      if (error !== rollback) {
        throw new Error(
          `Dedicated reservation exclusion check failed: ${error?.message ?? error}`,
        );
      }
    } finally {
      try {
        await client.$disconnect();
      } catch {
        throw new Error("Test database disconnect failed.");
      }
    }
  },
);
