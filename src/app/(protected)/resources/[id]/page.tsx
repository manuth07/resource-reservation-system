import Image from "next/image";
import { isTrustedBlobUrl } from "@/lib/storage-utils";
import { NavigationLink as Link } from "@/components/navigation-link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { getResource } from "@/lib/resource-service";
import { Card, PageHeader, StatusBadge, CategoryBadge } from "@/components/ui";
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

  return (
    <>
      <PageHeader
        section="Resource catalog"
        title={resource.name}
        description={resource.resourceCode}
        action={
          user.role === "ADMIN" && (
            <Link className="button button-primary" href={`/admin/resources/${resource.id}/edit`}>
              Edit resource
            </Link>
          )
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
        <dl className="grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="form-label">Category</dt>
            <dd className="mt-2 flex items-center gap-2">
              <CategoryBadge category={resource.category} />
              <span className="text-secondary text-sm">({resource.category.code})</span>
            </dd>
          </div>
          <div>
            <dt className="form-label">Operational status</dt>
            <dd className="mt-2">
              <StatusBadge tone={resource.isActive ? "success" : "neutral"}>
                {resource.isActive ? "Active" : "Inactive"}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="form-label">Capacity</dt>
            <dd className="mt-2 tabular-nums font-medium">{resource.capacity ?? "Not specified"}</dd>
          </div>
          {!resource.category.isVehicle && (
            <div>
              <dt className="form-label">Location</dt>
              <dd className="mt-2">{resource.location ?? "Not specified"}</dd>
            </div>
          )}
          <div>
            <dt className="form-label">Approval policy</dt>
            <dd className="mt-2">
              <StatusBadge tone={resource.requiresApproval ? "warning" : "accent"}>
                {resource.requiresApproval ? "Approval required" : "Direct booking policy"}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="form-label">Resource type</dt>
            <dd className="mt-2">{resource.category.isVehicle ? "Vehicle / Transport" : "Standard resource"}</dd>
          </div>
        </dl>
        <p className="feedback feedback-info mt-8">
          Operational status does not indicate availability at a particular date or time. Booking is not implemented yet.
          {resource.category.isVehicle && " Vehicle requests will require administrator assignment of a specific vehicle and driver."}
        </p>
      </Card>
      <Link href="/resources" className="text-link mt-6 inline-block">
        Back to resource catalog
      </Link>
    </>
  );
}
