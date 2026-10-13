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
    <Suspense fallback={<PageLoading title="Direct reservation" variant="detail" />}>
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

  // Check direct booking eligibility
  const isVehicle = resource.category.isVehicle;
  const isInactive = !resource.isActive;
  const requiresApproval = resource.requiresApproval;

  if (isVehicle || isInactive || requiresApproval) {
    return (
      <>
        <PageHeader
          section="Direct reservation"
          title="Direct booking unavailable"
          description={`Direct booking cannot be initiated for "${resource.name}".`}
        />
        <Card className="max-w-2xl p-6 sm:p-8 space-y-4">
          {isInactive && (
            <p className="text-secondary">
              This resource is currently marked <strong>inactive</strong> and cannot accept reservations.
            </p>
          )}
          {isVehicle && (
            <p className="text-secondary">
              Vehicle resources cannot be directly reserved. Vehicles and drivers must be allocated by administrators as part of the vehicle request workflow.
            </p>
          )}
          {requiresApproval && (
            <p className="text-secondary">
              This resource requires supervisory review and approval before booking. Direct booking is not permitted.
            </p>
          )}
          <div className="pt-4 border-t border-border">
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

  return (
    <>
      <PageHeader
        section="Direct reservation"
        title={`Book ${resource.name}`}
        description="Select an available time slot for immediate reservation confirmation."
      />
      <div className="max-w-3xl">
        <ReservationForm resource={resource} />
      </div>
    </>
  );
}
