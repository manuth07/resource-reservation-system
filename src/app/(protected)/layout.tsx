import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { WorkspaceLoading, PageLoading } from "@/components/page-loading";
import { requirePageUser } from "@/lib/page-auth";
import { logoutAction } from "@/app/auth-actions";
import { WorkspaceShell } from "@/components/workspace-shell";
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<WorkspaceLoading />}><ProtectedWorkspace>{children}</ProtectedWorkspace></Suspense>;
}

async function ProtectedWorkspace({ children }: { children: ReactNode }) {
  await connection();
  const user = await requirePageUser();
  return <WorkspaceShell employeeId={user.employeeId} roleLabel={user.role === "ADMIN" ? "Administrator" : user.role === "DEPARTMENT_HEAD" ? "Department Head" : "Employee"} isAdmin={user.role === "ADMIN"} logoutAction={logoutAction}>
    <Suspense fallback={<PageLoading />}>{children}</Suspense>
  </WorkspaceShell>;
}
