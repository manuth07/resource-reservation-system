import Image from "next/image";
import { isTrustedBlobUrl } from "@/lib/storage-utils";
import { NavigationLink as Link } from "@/components/navigation-link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { getResource } from "@/lib/resource-service";
import { Card, PageHeader, StatusBadge, CategoryBadge, Feedback } from "@/components/ui";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

type Props = { params: Promise<{ id: string }> };

export default function ResourceDetailPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Resource details" variant="detail" />}>
      <ResourceDetailContent {...props} />
    </Suspense>
  );
}

async function ResourceDetailContent({ params }: Props) {
  await connection();
  const user = await requirePageUser();
  const resource = await getResource((await params).id);
  if (!resource) notFound();

  const isDirectBookingEligible =
    resource.isActive && !resource.requiresApproval && !resource.category.isVehicle;

  return (
    <>
      <PageHeader
        section="Resource catalog"
        title={resource.name}
        description={resource.resourceCode}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isDirectBookingEligible && (
              <Link
                className="button button-primary"
                href={`/resources/${resource.id}/book`}
              >
                Book resource
              </Link>
            )}
            {user.role === "ADMIN" && (
              <Link
                className={
                  isDirectBookingEligible
                    ? "button button-secondary"
                    : "button button-primary"
                }
                href={`/admin/resources/${resource.id}/edit`}
              >
                Edit resource
              </Link>
            )}
          </div>
        }
      />
      <Card className="max-w-3xl p-6 sm:p-8">
        {resource.imageUrl ? (
          <div className="relative mb-6 w-full overflow-hidden rounded-lg border border-border bg-table-header aspect-video sm:aspect-[21/9]">
            <Image
              src={resource.imageUrl}
              alt={`Photograph of ${resource.name}`}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              unoptimized={isTrustedBlobUrl(resource.imageUrl)}
            />
          </div>
        ) : (
          <div className="mb-6 flex h-36 w-full items-center justify-center rounded-lg border border-dashed border-border bg-table-header text-secondary">
            <div className="flex items-center gap-2 text-sm">
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              <span>No photograph uploaded for this resource</span>
            </div>
          </div>
        )}

        {/* Section 1: Resource Overview */}
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
            Resource overview
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Category</dt>
              <dd className="flex items-center gap-2">
                <CategoryBadge category={resource.category} />
                <span className="font-mono text-xs text-secondary">({resource.category.code})</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Status</dt>
              <dd>
                <StatusBadge tone={resource.isActive ? "success" : "neutral"}>
                  {resource.isActive ? "Active" : "Inactive"}
                </StatusBadge>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Capacity</dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {resource.capacity ? `${resource.capacity} people` : "Not specified"}
              </dd>
            </div>
            {!resource.category.isVehicle && (
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted">Location</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {resource.location ?? "Not specified"}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Subtle section divider */}
        <hr className="my-6 border-border" />

        {/* Section 2: Booking Information */}
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">
            Booking information
          </h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Booking type</dt>
              <dd className="text-sm font-semibold text-foreground">
                {resource.category.isVehicle
                  ? "Vehicle allocation (managed)"
                  : isDirectBookingEligible
                    ? "Direct booking"
                    : "Supervised request"}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted">Approval</dt>
              <dd>
                <StatusBadge tone={resource.requiresApproval ? "warning" : "accent"}>
                  {resource.requiresApproval ? "Approval required" : "Not required"}
                </StatusBadge>
              </dd>
            </div>
          </dl>

          {/* Compact policy note / alerts */}
          {isDirectBookingEligible && (
            <p className="text-xs text-secondary pt-1">
              Direct booking is enabled. Reservations are confirmed immediately upon submission without requiring managerial approval.
            </p>
          )}

          {!resource.isActive && (
            <Feedback tone="warning" className="mt-2">
              This resource is currently marked inactive and cannot be reserved.
            </Feedback>
          )}

          {resource.isActive && resource.category.isVehicle && (
            <Feedback tone="info" className="mt-2">
              Vehicle resources cannot be reserved directly. Transport requests require vehicle and driver allocation.
            </Feedback>
          )}

          {resource.isActive && !resource.category.isVehicle && resource.requiresApproval && (
            <Feedback tone="info" className="mt-2">
              This resource requires supervisory review and approval before booking. Direct booking is not permitted.
            </Feedback>
          )}
        </div>
      </Card>
      <Link href="/resources" className="text-link mt-6 inline-block">
        Back to resource catalog
      </Link>
    </>
  );
}
