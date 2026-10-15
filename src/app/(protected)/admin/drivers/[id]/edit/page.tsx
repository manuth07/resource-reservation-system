import { connection } from "next/server";
import { notFound } from "next/navigation";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { getDriver } from "@/lib/driver-service";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { DriverForm } from "@/components/driver-form";
import { DriverStatusDialog } from "@/components/driver-status-dialog";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditDriverPage({ params }: Props) {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  const { id } = await params;
  const driver = await getDriver(id);

  if (!driver) {
    notFound();
  }

  return (
    <>
      <PageHeader
        section="Administration"
        title={`Edit ${driver.name}`}
        description={`Identifier: ${driver.driverIdentifier}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge tone={driver.isActive ? "success" : "neutral"}>
              {driver.isActive ? "Active" : "Inactive"}
            </StatusBadge>
            <DriverStatusDialog
              driverId={driver.id}
              driverName={driver.name}
              isActive={driver.isActive}
              activeReservationCount={driver.activeReservationCount}
            />
          </div>
        }
      />

      <div className="max-w-2xl space-y-6">
        <DriverForm driver={driver} />

        <Card className="p-6">
          <h2 className="section-title">Assignment status</h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted font-medium">Total assignments</dt>
              <dd className="mt-1 font-semibold text-foreground tabular-nums">
                {driver.reservationCount} {driver.reservationCount === 1 ? "reservation" : "reservations"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted font-medium">Active / Upcoming</dt>
              <dd className="mt-1 font-semibold text-foreground tabular-nums">
                {driver.activeReservationCount} {driver.activeReservationCount === 1 ? "reservation" : "reservations"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-secondary border-t border-border pt-3">
            Registered on {new Date(driver.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
            Historical assignments are permanently preserved even if this driver is deactivated.
          </p>
        </Card>
      </div>
    </>
  );
}
