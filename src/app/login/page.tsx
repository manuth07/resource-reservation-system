import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/authorization";
import { AuthForm } from "@/components/auth-form";
import { Card, PageHeader } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await getAuthenticatedUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  const params = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section aria-label="About PrimeWave" className="hidden flex-col justify-between bg-foreground p-12 text-surface lg:flex xl:p-16">
        <p className="font-heading text-xl font-bold">PrimeWave <span className="ml-2 text-accent-on-dark">/</span></p>
        <div className="max-w-lg py-12">
          <p className="mb-6 text-sm font-semibold text-accent-on-dark">Your workplace, connected</p>
          <h2 className="font-heading text-4xl font-semibold leading-tight xl:text-5xl">Space to meet.<br />Resources to move<br />work forward.</h2>
          <p className="mt-8 max-w-md text-base leading-7 text-muted-on-dark">One place for your team’s rooms, equipment and transport. Sign in with your employee account to get started.</p>
        </div>
        <p className="text-xs text-muted-on-dark">Resource Reservation Management · Internal access</p>
      </section>
      <section aria-label="Employee sign in" className="flex flex-col items-center justify-center gap-8 px-4 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-md lg:hidden">
          <p className="brand">PrimeWave</p>
          <p className="mt-2 text-muted">Resource Reservation Management</p>
        </div>
        <Card className="w-full max-w-md border-t-4 border-t-primary p-6 sm:p-8">
          <PageHeader title="Sign in" description="Enter the employee ID and password provided by your administrator." />
          {params.password === "changed" && <p role="status" className="feedback feedback-success mb-6">Your password was changed. Sign in again with your new password.</p>}
          <AuthForm mode="login" />
        </Card>
        <p className="max-w-md text-center text-sm text-muted">For account access or sign-in assistance, contact your administrator.</p>
      </section>
    </main>
  );
}
