import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { listCategoryOptions } from "@/lib/resource-service";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ResourceForm } from "@/components/resource-form";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

export default function NewResourcePage() {
  return <Suspense fallback={<PageLoading title="Add resource" variant="form" />}><NewResourceContent /></Suspense>;
}
async function NewResourceContent() {
  await connection(); await requirePageUser(UserRole.ADMIN);
  const categories = await listCategoryOptions();
  return <><PageHeader section="Administration / Resources" title="Add resource" description="Define operational details and the resource's booking policy." />{categories.length ? <ResourceForm categories={categories} /> : <Card><EmptyState title="Create a category first" description="Every resource must belong to an existing category." action={<Link className="button button-primary" href="/admin/resource-categories/new">Create category</Link>} /></Card>}</>;
}
