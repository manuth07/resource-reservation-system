import { Suspense } from "react";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import { DepartmentForm } from "@/components/department-form";

export default function NewDepartmentPage() {
  return (
    <Suspense fallback={<PageLoading title="Create department" variant="detail" />}>
      <NewDepartmentContent />
    </Suspense>
  );
}

async function NewDepartmentContent() {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  return (
    <>
      <PageHeader
        section="Departments"
        title="Create department"
        description="Add a new organizational department to enable employee provisioning and approval workflows."
      />

      <div className="max-w-2xl">
        <DepartmentForm />
      </div>
    </>
  );
}
