import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { DriverForm } from "@/components/driver-form";

export default async function NewDriverPage() {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  return (
    <>
      <PageHeader
        section="Administration"
        title="Register driver"
        description="Add an organizational transport driver for fleet vehicle reservations."
      />
      <div className="max-w-2xl">
        <DriverForm />
      </div>
    </>
  );
}
