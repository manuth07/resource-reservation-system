import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { requirePageUser } from "@/lib/page-auth";
import { getEligibleDirectResource } from "@/lib/reservation-service";
import { Card, PageHeader } from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import { ReservationForm } from "@/components/reservation-form";

type Props = { params: Promise<{ id: string }> };

export default function BookResourcePage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Reservation" variant="detail" />}>
      <BookResourceContent {...props} />
    </Suspense>
  );
}

async function BookResourceContent({ params }: Props) {
  await connection();
  await requirePageUser();

  const { id } = await params;
  const resource = await getEligibleDirectResource(id);

  if (!resource) {
    notFound();
  }

  const isVehicle = resource.category.isVehicle;
  const isInactive = !resource.isActive;

  if (isVehicle || isInactive) {
    return (
      <>
        <PageHeader
          section="Reservation"
          title="Reservation unavailable"
          description={`Reservations cannot be initiated for "${resource.name}".`}
        />
        <Card className="max-w-2xl p-6 sm:p-8 space-y-4">
          {isInactive && (
            <p className="text-secondary">
              This resource is currently marked <strong>inactive</strong> and cannot accept reservations.
            </p>
          )}
          {isVehicle && (
            <div className="space-y-3">
              <p className="text-secondary">
                Vehicle resources cannot be directly reserved. Transport requests are submitted by vehicle category, and vehicles and drivers are allocated by administrators during approval and scheduling.
              </p>
              <div>
                <Link
                  href={`/transport/request?categoryId=${resource.category.id}`}
                  className="button button-primary"
                >
                  Request transport
                </Link>
              </div>
            </div>
          )}
          <div className="pt-4 border-t border-border flex items-center gap-3">
            <Link
              href={`/resources/${resource.id}`}
              className="button button-secondary"
            >
              Back to resource details
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const isApprovalRequired = resource.requiresApproval;

  return (
    <>
      <PageHeader
        section={isApprovalRequired ? "Reservation request" : "Direct reservation"}
        title={isApprovalRequired ? `Request ${resource.name}` : `Book ${resource.name}`}
        description={
          isApprovalRequired
            ? "Submit this reservation request for administrative review and Department Head approval."
            : "Select an available time slot for immediate reservation confirmation."
        }
      />
      <div className="max-w-3xl">
        <ReservationForm resource={resource} />
      </div>
    </>
  );
}
