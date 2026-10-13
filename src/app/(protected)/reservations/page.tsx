import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { requirePageUser } from "@/lib/page-auth";
import { listMyReservations } from "@/lib/reservation-service";
import type { DisplayReservationStatus, ReservationTabFilter } from "@/lib/reservation-types";
import {
  Card,
  CategoryBadge,
  DataTable,
  EmptyState,
  PageHeader,
  StatusBadge,
  type StatusTone,
} from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import {
  formatColomboDate,
  formatColomboTime,
} from "@/lib/reservation-validation";

type Props = {
  searchParams: Promise<{
    tab?: string;
    page?: string;
  }>;
};

export default function ReservationsPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="My reservations" variant="table" />}>
      <ReservationsContent {...props} />
    </Suspense>
  );
}

function getStatusTone(status: DisplayReservationStatus): StatusTone {
  switch (status) {
    case "CONFIRMED":
      return "success";
    case "COMPLETED":
      return "neutral";
    case "CANCELLED":
    case "REJECTED":
      return "danger";
    case "PENDING":
    case "AWAITING_APPROVAL":
      return "warning";
    case "APPROVED":
      return "info";
    default:
      return "neutral";
  }
}

function getStatusLabel(status: DisplayReservationStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmed";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "PENDING":
      return "Pending";
    case "AWAITING_APPROVAL":
      return "Awaiting approval";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

async function ReservationsContent({ searchParams }: Props) {
  await connection();
  await requirePageUser();

  const params = await searchParams;
  const rawTab = params.tab;
  const tab: ReservationTabFilter =
    rawTab === "past" || rawTab === "cancelled" || rawTab === "all"
      ? rawTab
      : "upcoming";
  const page = Math.max(1, Number(params.page) || 1);

  const { reservations, total, pages } = await listMyReservations({ tab, page, take: 15 });

  const tabs: { key: ReservationTabFilter; label: string }[] = [
    { key: "upcoming", label: "Upcoming & Active" },
    { key: "past", label: "Past & Completed" },
    { key: "cancelled", label: "Cancelled" },
    { key: "all", label: "All history" },
  ];

  return (
    <>
      <PageHeader
        section="Workspace"
        title="My reservations"
        description="View your reserved resources, schedules, and past booking history."
        action={
          <Link className="button button-primary" href="/resources">
            Book a resource
          </Link>
        }
      />

      {/* Tab controls */}
      <nav aria-label="Reservation status filter" className="mb-6">
        <ul className="flex flex-wrap gap-2 border-b border-border pb-2">
          {tabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <li key={t.key}>
                <Link
                  href={`/reservations?tab=${t.key}`}
                  className={`inline-block px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-b-2 border-primary text-primary font-semibold"
                      : "text-secondary hover:text-foreground"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {reservations.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title={`No ${tab} reservations found`}
            description={
              tab === "upcoming"
                ? "You do not have any active or upcoming resource reservations."
                : `No reservations match the ${tab} filter.`
            }
            action={
              <Link className="button button-primary" href="/resources">
                Browse resource catalog
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <DataTable label="Reservations list">
            <thead>
              <tr>
                <th scope="col">Resource</th>
                <th scope="col">Category</th>
                <th scope="col">Date</th>
                <th scope="col">Time (Asia/Colombo)</th>
                <th scope="col">Status</th>
                <th scope="col">Purpose</th>
                <th scope="col" className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((res) => {
                const startDate = formatColomboDate(res.startTime);
                const startTime = formatColomboTime(res.startTime);
                const endTime = formatColomboTime(res.endTime);
                const tone = getStatusTone(res.displayStatus);
                const statusLabel = getStatusLabel(res.displayStatus);

                return (
                  <tr key={res.id}>
                    <td>
                      <div className="font-medium text-foreground">
                        {res.resource?.name ?? "Resource deleted"}
                      </div>
                      <div className="font-mono text-xs text-secondary">
                        {res.resource?.resourceCode ?? "—"}
                      </div>
                    </td>
                    <td>
                      <CategoryBadge category={res.requestedCategory} />
                    </td>
                    <td className="tabular-nums text-sm text-foreground">
                      {startDate}
                    </td>
                    <td className="tabular-nums text-sm text-secondary">
                      {startTime} – {endTime}
                    </td>
                    <td>
                      <StatusBadge tone={tone}>
                        {statusLabel}
                      </StatusBadge>
                    </td>
                    <td className="max-w-xs truncate text-sm text-secondary" title={res.purpose}>
                      {res.purpose}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/reservations/${res.id}`}
                        className="button button-neutral button-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border p-4 text-sm text-secondary">
              <div>
                Showing page <span className="font-medium text-foreground">{page}</span> of{" "}
                <span className="font-medium text-foreground">{pages}</span> ({total} reservations)
              </div>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/reservations?tab=${tab}&page=${page - 1}`}
                    className="button button-secondary button-sm"
                  >
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link
                    href={`/reservations?tab=${tab}&page=${page + 1}`}
                    className="button button-secondary button-sm"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
