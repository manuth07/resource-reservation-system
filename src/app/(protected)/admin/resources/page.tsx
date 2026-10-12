import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { ResourceList } from "@/components/resource-list";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
export default function ManageResourcesPage(props: Props) {
  return <Suspense fallback={<PageLoading title="Manage resources" />}><ManageResourcesContent {...props} /></Suspense>;
}
async function ManageResourcesContent({ searchParams }: Props) {
  await connection(); await requirePageUser(UserRole.ADMIN);
  return <><PageHeader section="Administration" title="Manage resources" description="Create, edit and deactivate organizational resources. History is preserved." action={<Link className="button button-primary" href="/admin/resources/new">Add resource</Link>} /><ResourceList searchParams={await searchParams} admin /></>;
}
