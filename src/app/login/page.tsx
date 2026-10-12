import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/authorization";
import { AuthForm } from "@/components/auth-form";
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getAuthenticatedUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  const params = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-slate-950 px-16 py-12 text-white lg:flex">
        <div className="text-xl font-semibold tracking-tight">
          PrimeWave<span className="ml-2 text-teal-300">/</span>
        </div>
        <div className="max-w-lg py-24">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[.22em] text-teal-300">
            Your workplace, connected
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Space to meet.<br />Resources to move<br />work forward.
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-slate-300">
            One place for your team’s rooms, equipment and transport. Sign in with
            your employee account to get started.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Resource Reservation Management · Internal access
        </p>
      </section>
      <section className="flex items-center justify-center bg-slate-50 px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm">
          <p className="mb-10 text-xl font-semibold tracking-tight text-slate-900 lg:hidden">
            PrimeWave<span className="ml-2 text-teal-700">/</span>
          </p>
          <div className="mb-8">
            <p className="mb-3 text-sm font-medium text-teal-700">Welcome back</p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
              Sign in to your workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Use the employee ID and password provided by your administrator.
            </p>
          </div>
          {params.password === "changed" && (
            <p role="status" className="mb-6 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
              Your password was changed. Sign in again with your new password.
            </p>
          )}
          <AuthForm mode="login" />
          <p className="mt-8 text-center text-xs leading-6 text-slate-500">
            Need an account or help signing in?<br />Contact your administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
