import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
import { logoutAction } from "@/app/auth-actions";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { Button } from "@/components/ui";
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await connection();
  const user = await requirePageUser();
  return (
    <div className="min-h-screen">
      <a href="#workspace-main" className="skip-link">Skip to main content</a>
      <header className="app-header">
        <Link href="/dashboard" className="brand">PrimeWave</Link>
        <details className="account-menu">
          <summary>Account: <span className="font-semibold">{user.employeeId}</span></summary>
          <div className="account-menu-panel space-y-4">
            <p className="supporting-text">{user.role === "ADMIN" ? "Administrator" : user.role === "DEPARTMENT_HEAD" ? "Department Head" : "Employee"}</p>
            <Link href="/change-password" className="text-link block py-2">Change password</Link>
            <form action={logoutAction}><Button variant="secondary" type="submit" className="w-full">Sign out</Button></form>
          </div>
        </details>
      </header>
      <div className="app-body">
        <WorkspaceNavigation isAdmin={user.role === "ADMIN"} />
        <main id="workspace-main" tabIndex={-1} className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
