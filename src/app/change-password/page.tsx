import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAuthenticatedUser } from "@/lib/authorization";
import { logoutAction } from "@/app/auth-actions";
import { AuthForm } from "@/components/auth-form";
import { Button, Card, PageHeader } from "@/components/ui";
export default async function ChangePasswordPage() {
  await connection();
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:py-12">
      <Card className="w-full max-w-md border-t-4 border-t-primary p-6 sm:p-8">
        <PageHeader section="PrimeWave / Account security" title="Change your password" description={`${user.mustChangePassword ? "Replace your temporary password before accessing your workspace." : "Changing your password signs out all existing sessions."} Signed in as ${user.employeeId}.`} />
        <AuthForm mode="password" />
        <form action={logoutAction} className="mt-6"><Button variant="secondary" className="w-full" type="submit">Sign out instead</Button></form>
      </Card>
    </main>
  );
}
