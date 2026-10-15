import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { listDrivers } from "@/lib/driver-service";
import { DriverStatusDialog } from "@/components/driver-status-dialog";
import {
  Card,
  DataTable,
  EmptyState,
  Feedback,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { PageLoading } from "@/components/page-loading";

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: "ALL" | "ACTIVE" | "INACTIVE";
    saved?: string;
  }>;
};

export default function DriversPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Drivers" variant="table" />}>
      <DriversContent {...props} />
    </Suspense>
  );
}

async function DriversContent({ searchParams }: Props) {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status === "ACTIVE" || params.status === "INACTIVE" ? params.status : "ALL";

  const drivers = await listDrivers({ q, status });

  return (
    <>
      <PageHeader
        section="Administration"
        title="Drivers"
        description="Manage organizational transport drivers, contact details, and allocation eligibility."
        action={
          <Link className="button button-primary" href="/admin/drivers/new">
            Register driver
          </Link>
        }
      />

      {params.saved === "1" && (
        <Feedback tone="success" className="mb-6">
          Driver record saved successfully.
        </Feedback>
      )}

      {/* Filter and search bar */}
      <Card className="mb-6 p-4">
        <form method="GET" action="/admin/drivers" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search by name, identifier, phone, or email…"
              className="field"
            />
            <button type="submit" className="button button-secondary">
              Search
            </button>
            {q && (
              <Link href={`/admin/drivers?status=${status}`} className="button button-neutral">
                Clear
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-secondary">Status:</span>
            <div className="flex gap-1 border border-border p-0.5">
              {(["ALL", "ACTIVE", "INACTIVE"] as const).map((s) => (
                <Link
                  key={s}
                  href={`/admin/drivers?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`px-2.5 py-1 text-xs font-medium ${
                    status === s
                      ? "bg-navigation-selected text-primary font-semibold"
                      : "text-secondary hover:text-foreground"
                  }`}
                >
                  {s === "ALL" ? "All" : s === "ACTIVE" ? "Active" : "Inactive"}
                </Link>
              ))}
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <div className="directory-header">
          <h2 className="card-title">Driver roster</h2>
          <p className="directory-count">
            {drivers.length} {drivers.length === 1 ? "driver" : "drivers"}
            {status !== "ALL" || q ? " matching filters" : ""}
          </p>
        </div>

        {drivers.length === 0 ? (
          <EmptyState
            title="No drivers found"
            description={
              q || status !== "ALL"
                ? "No drivers match your current search or status filters. Clear filters to see all drivers."
                : "No drivers have been registered yet. Register drivers to enable vehicle reservation allocations."
            }
            action={
              !q && status === "ALL" ? (
                <Link className="button button-primary" href="/admin/drivers/new">
                  Register driver
                </Link>
              ) : undefined
            }
          />
        ) : (
          <DataTable label="Driver roster table">
            <thead>
              <tr>
                <th scope="col">Driver</th>
                <th scope="col">Identifier</th>
                <th scope="col">Phone</th>
                <th scope="col">Email</th>
                <th scope="col">Status</th>
                <th scope="col">Assignments</th>
                <th scope="col" className="text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id}>
                  <td>
                    <div className="font-medium text-foreground">{driver.name}</div>
                  </td>
                  <td>
                    <span className="rounded bg-table-header px-2 py-0.5 font-mono text-xs font-medium text-secondary">
                      {driver.driverIdentifier}
                    </span>
                  </td>
                  <td>
                    <span className="tabular-nums text-sm text-foreground">
                      {driver.phone}
                    </span>
                  </td>
                  <td>
                    {driver.email ? (
                      <span className="text-xs text-secondary">{driver.email}</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge tone={driver.isActive ? "success" : "neutral"}>
                      {driver.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  <td>
                    <div className="text-xs text-secondary">
                      <span className="font-semibold text-foreground tabular-nums">
                        {driver.reservationCount}
                      </span>{" "}
                      total
                      {driver.activeReservationCount > 0 && (
                        <span className="ml-1 text-primary font-medium">
                          ({driver.activeReservationCount} active)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/drivers/${driver.id}/edit`}
                        className="button button-neutral button-sm"
                      >
                        Edit
                      </Link>
                      <DriverStatusDialog
                        driverId={driver.id}
                        driverName={driver.name}
                        isActive={driver.isActive}
                        activeReservationCount={driver.activeReservationCount}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
