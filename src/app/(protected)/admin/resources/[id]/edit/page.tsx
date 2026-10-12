import { connection } from "next/server";
import { notFound } from "next/navigation";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { getResourceForEdit, listCategoryOptions } from "@/lib/resource-service";
import { PageHeader } from "@/components/ui";
import { ResourceForm } from "@/components/resource-form";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

type Props = { params: Promise<{ id: string }> };
export default function EditResourcePage(props: Props) {
  return <Suspense fallback={<PageLoading title="Edit resource" variant="form" />}><EditResourceContent {...props} /></Suspense>;
}
async function EditResourceContent({ params }: Props) {
  await connection(); await requirePageUser(UserRole.ADMIN);
  const [record, categories] = await Promise.all([getResourceForEdit((await params).id), listCategoryOptions()]);
  if (!record) notFound();
  return <><PageHeader section="Administration / Resources" title="Edit resource" description={`Update ${record.resource.name}. Existing reservation records are preserved.`} /><ResourceForm categories={categories} resource={record.resource} policyLocked={record.policyLocked} /></>;
}
