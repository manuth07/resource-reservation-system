import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { listAdminReservationRequests } from "@/lib/reservation-service";
import type {
  AdminReservationQueueTab,
  DisplayReservationStatus,
} from "@/lib/reservation-types";
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
import { ApprovalControls } from "@/components/approval-controls";

type Props = {
  searchParams: Promise<{
    tab?: string;
    page?: string;
  }>;
};

export default function AdminReservationsPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Reservation requests" variant="table" />}>
      <AdminReservationsContent {...props} />
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
      return "Pending review";
    case "AWAITING_APPROVAL":
      return "Awaiting HOD";
    case "APPROVED":
      return "Ready to confirm";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

async function AdminReservationsContent({ searchParams }: Props) {
  await connection();
  const user = await requirePageUser(UserRole.ADMIN);

  const params = await searchParams;
  const rawTab = params.tab;
  const tab: AdminReservationQueueTab =
    rawTab === "awaiting_hod" || rawTab === "approved" || rawTab === "all"
      ? rawTab
      : "pending";
  const page = Math.max(1, Number(params.page) || 1);

  const { reservations, total, pages } = await listAdminReservationRequests({
    tab,
    page,
    take: 15,
  });

  const tabs: { key: AdminReservationQueueTab; label: string }[] = [
    { key: "pending", label: "Pending review" },
    { key: "awaiting_hod", label: "Awaiting Department Head" },
    { key: "approved", label: "Ready to confirm" },
    { key: "all", label: "All requests" },
  ];

  return (
    <>
      <PageHeader
        section="Administration"
        title="Reservation requests"
        description="Review, route, and confirm resource reservations requiring administrative oversight."
      />

      {/* Tabs */}
      <nav aria-label="Reservation queue filter" className="mb-6">
        <ul className="flex flex-wrap gap-2 border-b border-border pb-2">
          {tabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <li key={t.key}>
                <Link
                  href={`/admin/reservations?tab=${t.key}`}
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
            title={`No requests in "${tabs.find((t) => t.key === tab)?.label}"`}
            description={
              tab === "pending"
                ? "There are currently no new reservation requests awaiting administrative review."
                : tab === "awaiting_hod"
                ? "No reservation requests are currently awaiting Department Head decisions."
                : tab === "approved"
                ? "No approved reservation requests are waiting for final administrative confirmation."
                : "No reservation requests found in the system."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <DataTable label="Admin reservation queue">
            <thead>
              <tr>
                <th scope="col">Requester & Dept</th>
                <th scope="col">Resource</th>
                <th scope="col">Category</th>
                <th scope="col">Date & Time (Asia/Colombo)</th>
                <th scope="col">Status</th>
                <th scope="col">Purpose</th>
                <th scope="col" className="text-right whitespace-nowrap">Actions</th>
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
                        {res.requester.name}
                      </div>
                      <div className="text-xs text-secondary">
                        {res.department.name} ({res.department.code})
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-foreground">
                        {res.resource?.name ??
                          (res.requestedCategory.isVehicle
                            ? "Vehicle awaiting allocation"
                            : "Resource unlinked")}
                      </div>
                      <div className="text-xs text-secondary">
                        {res.resource?.resourceCode ? (
                          <span>
                            <span className="font-mono">{res.resource.resourceCode}</span>
                            {res.driver ? ` • Driver: ${res.driver.name}` : ""}
                            {res.destination ? ` • To: ${res.destination}` : ""}
                          </span>
                        ) : res.requestedCategory.isVehicle ? (
                          res.destination ? (
                            <span>To: {res.destination} • {res.passengerCount ?? 1} {res.passengerCount === 1 ? "passenger" : "passengers"}</span>
                          ) : (
                            "Allocation pending"
                          )
                        ) : (
                          "—"
                        )}
                      </div>
                    </td>
                    <td>
                      <CategoryBadge category={res.requestedCategory} />
                    </td>
                    <td>
                      <div className="tabular-nums text-sm text-foreground">
                        {startDate}
                      </div>
                      <div className="tabular-nums text-xs text-secondary">
                        {startTime} – {endTime}
                      </div>
                    </td>
                    <td>
                      <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                    </td>
                    <td
                      className="max-w-xs truncate text-sm text-secondary"
                      title={res.purpose}
                    >
                      {res.purpose}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <ApprovalControls
                          reservationId={res.id}
                          status={res.status}
                          userRole={user.role}
                          isVehicle={res.requestedCategory.isVehicle}
                          resourceId={res.resourceId}
                          compact
                        />
                        {res.requestedCategory.isVehicle && res.status === "APPROVED" && !res.resourceId ? (
                          <Link
                            href={`/admin/reservations/${res.id}#allocate`}
                            className="button button-primary button-sm whitespace-nowrap"
                          >
                            Allocate
                          </Link>
                        ) : (
                          <Link
                            href={`/admin/reservations/${res.id}`}
                            className="button button-neutral button-sm whitespace-nowrap"
                          >
                            Review
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <span className="text-xs text-secondary">
                Page {page} of {pages} ({total} total requests)
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/admin/reservations?tab=${tab}&page=${page - 1}`}
                    className="button button-secondary button-sm"
                  >
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link
                    href={`/admin/reservations?tab=${tab}&page=${page + 1}`}
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
