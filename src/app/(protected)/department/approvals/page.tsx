import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { listHodApprovalQueue } from "@/lib/reservation-service";
import type { DisplayReservationStatus } from "@/lib/reservation-types";
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

export default function DepartmentApprovalsPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Department approval queue" variant="table" />}>
      <DepartmentApprovalsContent {...props} />
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
      return "Awaiting your decision";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

async function DepartmentApprovalsContent({ searchParams }: Props) {
  await connection();
  const user = await requirePageUser(UserRole.DEPARTMENT_HEAD, UserRole.ADMIN);

  const params = await searchParams;
  const rawTab = params.tab;
  const tab = rawTab === "history" ? "history" : "pending";
  const page = Math.max(1, Number(params.page) || 1);

  const { reservations, total, pages } = await listHodApprovalQueue({
    tab,
    page,
    take: 15,
  });

  const tabs = [
    { key: "pending", label: "Awaiting my decision" },
    { key: "history", label: "Decision history" },
  ];

  return (
    <>
      <PageHeader
        section="Department"
        title="Approval queue"
        description="Review and authorize reservation requests submitted by members of your department."
      />

      {/* Tabs */}
      <nav aria-label="Department approval queue filter" className="mb-6">
        <ul className="flex flex-wrap gap-2 border-b border-border pb-2">
          {tabs.map((t) => {
            const isActive = tab === t.key;
            return (
              <li key={t.key}>
                <Link
                  href={`/department/approvals?tab=${t.key}`}
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
            title={
              tab === "pending"
                ? "No pending department requests"
                : "No approval history recorded"
            }
            description={
              tab === "pending"
                ? "There are currently no reservation requests awaiting your departmental decision."
                : "No past approval or rejection decisions have been recorded for your department."
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <DataTable label="Department approval queue">
            <thead>
              <tr>
                <th scope="col">Requester</th>
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
                const isRequester = res.requesterId === user.id;

                return (
                  <tr key={res.id}>
                    <td>
                      <div className="font-medium text-foreground">
                        {res.requester.name}
                      </div>
                      <div className="text-xs text-secondary">
                        ID: {res.requester.employeeId}
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
                          isDepartmentHeadForReservation={true}
                          isRequester={isRequester}
                          isVehicle={res.requestedCategory.isVehicle}
                          resourceId={res.resourceId}
                          compact
                        />
                        <Link
                          href={`/reservations/${res.id}`}
                          className="button button-neutral button-sm whitespace-nowrap"
                        >
                          Review
                        </Link>
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
                    href={`/department/approvals?tab=${tab}&page=${page - 1}`}
                    className="button button-secondary button-sm"
                  >
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link
                    href={`/department/approvals?tab=${tab}&page=${page + 1}`}
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
