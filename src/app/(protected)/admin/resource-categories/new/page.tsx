import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { CategoryForm } from "@/components/category-form";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

export default function NewCategoryPage() {
  return <Suspense fallback={<PageLoading title="Create category" variant="form" />}><NewCategoryContent /></Suspense>;
}
async function NewCategoryContent() {
  await connection(); await requirePageUser(UserRole.ADMIN);
  return <><PageHeader section="Administration / Resource categories" title="Create category" description="Use a unique organizational code and descriptive name." /><CategoryForm /></>;
}
