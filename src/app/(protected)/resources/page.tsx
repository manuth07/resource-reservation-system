import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { ResourceList } from "@/components/resource-list";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function ResourcesPage(props: Props) {
  return <Suspense fallback={<PageLoading title="Resources" />}><ResourcesContent {...props} /></Suspense>;
}
async function ResourcesContent({ searchParams }: Props) {
  await connection();
  const user = await requirePageUser();
  return (
    <>
      <PageHeader
        title="Resource catalog"
        description="Find and compare rooms, equipment and transport."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link className="button button-primary" href="/transport/request">
              Request transport
            </Link>
            {user.role === "ADMIN" && (
              <Link className="button button-secondary" href="/admin/resources">
                Manage resources
              </Link>
            )}
          </div>
        }
      />
      <ResourceList searchParams={await searchParams} />
    </>
  );
}
