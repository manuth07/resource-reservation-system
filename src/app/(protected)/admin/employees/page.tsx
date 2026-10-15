import { Suspense } from "react";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { EmployeeManagement } from "@/components/employee-management";
import { PageHeader } from "@/components/ui";
import { PageLoading } from "@/components/page-loading";

export default function EmployeesPage() {
  return (
    <Suspense fallback={<PageLoading title="Employees and access" />}>
      <EmployeesContent />
    </Suspense>
  );
}

async function EmployeesContent() {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, name: true, code: true, headId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        employeeId: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        departmentId: true,
        department: { select: { id: true, name: true, headId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        section="Administration"
        title="Employees and access"
        description="Provision employee accounts and manage department assignments for your organization."
      />
      <EmployeeManagement departments={departments} employees={employees} />
    </>
  );
}
