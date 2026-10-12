import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { Card, PageHeader } from "@/components/ui";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
export default function DashboardPage() {
  return <Suspense fallback={<PageLoading title="Dashboard" variant="detail" />}><DashboardContent /></Suspense>;
}
async function DashboardContent() {
  await connection();
  const user = await requirePageUser();
  const admin = user.role === "ADMIN";
  const head = user.role === "DEPARTMENT_HEAD";
  return (
    <>
      <PageHeader title="Dashboard" description={admin ? "Manage shared resources and employee access." : "Explore the resources available across your organization."} action={<Link className="button button-primary" href={admin ? "/admin/resources" : "/resources"}>{admin ? "Manage resources" : "Browse resources"}</Link>} />
      <div className="grid gap-4 sm:grid-cols-2">
        {admin ? <>
          <Card className="p-5"><h2 className="card-title">Resource categories</h2><p className="mt-2 text-secondary">Organize rooms, equipment and transport by booking workflow.</p><Link href="/admin/resource-categories" className="text-link mt-4 inline-flex min-h-11 items-center">Open categories</Link></Card>
          <Card className="p-5"><h2 className="card-title">Employee accounts</h2><p className="mt-2 text-secondary">Provision access, designate department heads and reset credentials.</p><Link href="/admin/employees" className="text-link mt-4 inline-flex min-h-11 items-center">Manage employees</Link></Card>
        </> : <Card className="p-5 sm:col-span-2"><h2 className="card-title">Your resource workspace</h2><p className="mt-2 text-secondary">Compare rooms, equipment and transport in the catalog. Operational status is shown separately from date and time availability.</p></Card>}
      </div>
      <p className="supporting-text mt-6 border-t border-border pt-4">{head ? "Reservation booking and department approvals are not yet available." : "Reservation booking is not yet available."}</p>
    </>
  );
}
