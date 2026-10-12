import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/authorization";
import { logoutAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";
export default async function ChangePasswordPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><p className="text-sm font-semibold text-teal-700">PrimeWave · Account security</p><h1 className="mt-4 text-3xl font-semibold tracking-tight">{user.mustChangePassword ? "Make this account yours" : "Change your password"}</h1><p className="mt-3 mb-7 text-sm leading-6 text-slate-500">{user.mustChangePassword ? "Replace your temporary password before accessing your workspace." : "Changing your password signs out all existing sessions."} Signed in as {user.employeeId}.</p><AuthForm mode="password" /><form action={logoutAction} className="mt-6 text-center"><button className="text-sm font-medium text-slate-600 hover:text-slate-900">Sign out instead</button></form></section></main>;
}
