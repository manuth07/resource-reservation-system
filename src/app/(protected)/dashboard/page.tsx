import Link from "next/link";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
export default async function DashboardPage() {
  await connection();
  const user = await requirePageUser();
  const admin = user.role === "ADMIN";
  const head = user.role === "DEPARTMENT_HEAD";
  return (
    <>
      <PageHeader section={admin ? "Administration" : head ? "Department workspace" : "Employee workspace"} title="Dashboard" description={`Signed in as ${user.employeeId}. ${admin ? "Manage employee access for your organization." : "Your account is ready to use."}`} />
      <div className="space-y-8">
        {admin && (
          <Card className="p-6 sm:p-8">
            <h2 className="section-title">Employee accounts</h2>
            <p className="mt-2 text-secondary">Create employee accounts, designate department heads and reset credentials.</p>
            <Link href="/admin/employees" className="button button-primary mt-4">Manage employees</Link>
          </Card>
        )}
        <Card className="p-6 sm:p-8">
          <StatusBadge tone="info">Not yet available</StatusBadge>
          <h2 className="section-title mt-4">{head ? "Reservations and department approvals" : "Resource reservations"}</h2>
          <p className="mt-2 text-secondary">{head ? "Resource booking and department request reviews will be available here." : "Meeting rooms, equipment and transport booking will be available here."}</p>
        </Card>
      </div>
    </>
  );
}
