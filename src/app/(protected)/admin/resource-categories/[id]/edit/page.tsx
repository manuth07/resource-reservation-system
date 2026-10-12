import { connection } from "next/server";
import { notFound } from "next/navigation";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { getCategory } from "@/lib/resource-service";
import { PageHeader } from "@/components/ui";
import { CategoryForm } from "@/components/category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await connection(); await requirePageUser(UserRole.ADMIN);
  const category = await getCategory((await params).id);
  if (!category) notFound();
  return <><PageHeader section="Administration / Resource categories" title="Edit category" description={`Update ${category.name}. Category-specific metadata is preserved.`} /><CategoryForm category={category} /></>;
}
