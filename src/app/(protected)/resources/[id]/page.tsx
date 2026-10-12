import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requirePageUser } from "@/lib/page-auth";
import { getResource } from "@/lib/resource-service";
import { Card, PageHeader, StatusBadge } from "@/components/ui";

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requirePageUser();
  const resource = await getResource((await params).id);
  if (!resource) notFound();
  return <><PageHeader section="Resource catalog" title={resource.name} description={resource.resourceCode} action={user.role === "ADMIN" && <Link className="button button-primary" href={`/admin/resources/${resource.id}/edit`}>Edit resource</Link>} /><Card className="max-w-3xl p-6 sm:p-8"><dl className="grid gap-6 sm:grid-cols-2"><div><dt className="form-label">Category</dt><dd className="mt-2">{resource.category.name} ({resource.category.code})</dd></div><div><dt className="form-label">Operational status</dt><dd className="mt-2"><StatusBadge tone={resource.isActive ? "success" : "neutral"}>{resource.isActive ? "Active" : "Inactive"}</StatusBadge></dd></div><div><dt className="form-label">Capacity</dt><dd className="mt-2 tabular-nums">{resource.capacity ?? "Not specified"}</dd></div><div><dt className="form-label">Location</dt><dd className="mt-2">{resource.location ?? "Not specified"}</dd></div><div><dt className="form-label">Approval policy</dt><dd className="mt-2">{resource.requiresApproval ? "Approval required" : "Direct booking policy"}</dd></div><div><dt className="form-label">Resource type</dt><dd className="mt-2">{resource.category.isVehicle ? "Vehicle" : "Non-vehicle"}</dd></div></dl><p className="feedback feedback-info mt-8">Operational status does not indicate availability at a particular date or time. Booking is not implemented yet.{resource.category.isVehicle && " Vehicle requests will require administrator assignment of a specific vehicle and driver."}</p></Card><Link href="/resources" className="text-link mt-6 inline-block">Back to resource catalog</Link></>;
}
