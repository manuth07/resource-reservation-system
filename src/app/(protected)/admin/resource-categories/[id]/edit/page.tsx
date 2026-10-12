import { connection } from "next/server";
import { notFound } from "next/navigation";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { getCategory } from "@/lib/resource-service";
import { PageHeader } from "@/components/ui";
import { CategoryForm } from "@/components/category-form";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

type Props = { params: Promise<{ id: string }> };
export default function EditCategoryPage(props: Props) {
  return <Suspense fallback={<PageLoading title="Edit category" variant="form" />}><EditCategoryContent {...props} /></Suspense>;
}
async function EditCategoryContent({ params }: Props) {
  await connection(); await requirePageUser(UserRole.ADMIN);
  const category = await getCategory((await params).id);
  if (!category) notFound();
  return <><PageHeader section="Administration / Resource categories" title="Edit category" description={`Update ${category.name}. Category-specific metadata is preserved.`} /><CategoryForm category={category} /></>;
}
