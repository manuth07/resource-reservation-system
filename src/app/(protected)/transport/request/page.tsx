import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { requirePageUser } from "@/lib/page-auth";
import { listVehicleCategories } from "@/lib/resource-service";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import { TransportRequestForm } from "@/components/transport-request-form";

type Props = {
  searchParams: Promise<{ categoryId?: string }>;
};

export default function TransportRequestPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Transport request" variant="detail" />}>
      <TransportRequestContent {...props} />
    </Suspense>
  );
}

async function TransportRequestContent({ searchParams }: Props) {
  await connection();
  const user = await requirePageUser();
  const { categoryId } = await searchParams;

  const categories = await listVehicleCategories();

  if (categories.length === 0) {
    return (
      <>
        <PageHeader
          section="Transport"
          title="Request transport"
          description="Submit a vehicle reservation request for official business travel."
        />
        <Card className="max-w-2xl p-6 sm:p-8">
          <EmptyState
            title="No vehicle categories configured"
            description="Vehicle categories (such as Van or Car) must be configured with transport classification before reservation requests can be submitted."
            action={
              user.role === "ADMIN" ? (
                <Link
                  href="/admin/resource-categories/new"
                  className="button button-primary"
                >
                  Configure vehicle category
                </Link>
              ) : undefined
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        section="Transport"
        title="Request transport"
        description="Select a vehicle category and travel schedule. A specific vehicle and driver will be allocated upon approval."
      />
      <div className="max-w-3xl">
        <TransportRequestForm
          categories={categories}
          initialCategoryId={categoryId}
        />
      </div>
    </>
  );
}
