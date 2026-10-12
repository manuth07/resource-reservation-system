import { requirePageUser } from "@/lib/page-auth";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { EmployeeManagement } from "@/components/employee-management";
import { PageHeader } from "@/components/ui";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
export default function EmployeesPage() {
  return <Suspense fallback={<PageLoading title="Employees and access" />}><EmployeesContent /></Suspense>;
}
async function EmployeesContent() {
  await connection();
  await requirePageUser(UserRole.ADMIN);
  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, employeeId: true, name: true, email: true, role: true, accountStatus: true, department: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return <><PageHeader section="Administration" title="Employees and access" description="Provision employee accounts for your organization. Public registration is disabled." /><EmployeeManagement departments={departments} employees={employees} /></>;
}
