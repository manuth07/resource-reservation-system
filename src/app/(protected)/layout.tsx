import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { WorkspaceLoading, PageLoading } from "@/components/page-loading";
import { requirePageUser } from "@/lib/page-auth";
import { logoutAction } from "@/app/auth-actions";
import { WorkspaceNavigation } from "@/components/workspace-navigation";
import { Button } from "@/components/ui";
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<WorkspaceLoading />}><ProtectedWorkspace>{children}</ProtectedWorkspace></Suspense>;
}

async function ProtectedWorkspace({ children }: { children: ReactNode }) {
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
        <main id="workspace-main" tabIndex={-1} className="workspace-content"><Suspense fallback={<PageLoading />}>{children}</Suspense></main>
      </div>
    </div>
  );
}
