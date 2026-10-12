import Link from "next/link";
import type { ReactNode } from "react";
import { requirePageUser } from "@/lib/page-auth";
import { logoutAction } from "@/app/auth-actions";
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return <div className="min-h-screen bg-slate-50"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5"><Link href="/dashboard" className="text-xl font-semibold tracking-tight">PrimeWave<span className="ml-1 text-teal-600">/</span></Link><nav aria-label="Workspace navigation" className="flex flex-wrap items-center gap-5 text-sm"><Link href="/dashboard">Workspace</Link>{user.role === "ADMIN" && <Link href="/admin/employees">Employees</Link>}<Link href="/change-password">Password</Link><form action={logoutAction}><button className="font-medium text-slate-500 hover:text-slate-900">Sign out</button></form></nav></div></header><main className="mx-auto max-w-6xl px-6 py-10">{children}</main></div>;
}
