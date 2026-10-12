import Link from "next/link";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { PageHeader } from "@/components/ui";
import { ResourceList } from "@/components/resource-list";

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await requirePageUser();
  return <><PageHeader title="Resources" description="Browse organizational rooms, equipment and transport." action={user.role === "ADMIN" && <Link className="button button-primary" href="/admin/resources">Manage resources</Link>} /><ResourceList searchParams={await searchParams} /></>;
}
