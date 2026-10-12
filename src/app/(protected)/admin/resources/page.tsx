import Link from "next/link";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { ResourceList } from "@/components/resource-list";

export default async function ManageResourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection(); await requirePageUser(UserRole.ADMIN);
  return <><PageHeader section="Administration" title="Manage resources" description="Create, edit and deactivate organizational resources. History is preserved." action={<Link className="button button-primary" href="/admin/resources/new">Add resource</Link>} /><ResourceList searchParams={await searchParams} admin /></>;
}
