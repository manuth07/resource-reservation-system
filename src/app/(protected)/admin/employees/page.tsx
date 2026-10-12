import { requirePageUser } from "@/lib/page-auth";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { EmployeeManagement } from "@/components/employee-management";
export default async function EmployeesPage() {
  await requirePageUser(UserRole.ADMIN);
  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ select: { id: true, employeeId: true, name: true, email: true, role: true, accountStatus: true, department: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return <><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Administration</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Employees & access</h1><p className="mt-3 text-slate-500">Provision accounts for your organization. Public registration is disabled.</p><EmployeeManagement departments={departments} employees={employees} /></>;
}
