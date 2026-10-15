import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import {
  getReservation,
  listAvailableVehicles,
} from "@/lib/reservation-service";
import { listAvailableDrivers } from "@/lib/driver-service";
import { PageLoading } from "@/components/page-loading";
import { ReservationDetailView } from "@/components/reservation-detail-view";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; requested?: string; allocated?: string }>;
};

export default function AdminReservationDetailPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Request details" variant="detail" />}>
      <AdminReservationDetailContent {...props} />
    </Suspense>
  );
}

async function AdminReservationDetailContent({ params, searchParams }: Props) {
  await connection();
  const user = await requirePageUser(UserRole.ADMIN);

  const { id } = await params;
  const alerts = await searchParams;

  const reservation = await getReservation(id);

  if (!reservation) {
    notFound();
  }

  let availableVehicles: Awaited<ReturnType<typeof listAvailableVehicles>> = [];
  let availableDrivers: Awaited<ReturnType<typeof listAvailableDrivers>> = [];

  const isApprovedVehicleAwaitingAllocation =
    reservation.status === "APPROVED" &&
    reservation.requestedCategory.isVehicle &&
    !reservation.resourceId;

  if (isApprovedVehicleAwaitingAllocation) {
    const start = new Date(reservation.startTime);
    const end = new Date(reservation.endTime);
    [availableVehicles, availableDrivers] = await Promise.all([
      listAvailableVehicles(
        reservation.requestedCategoryId,
        start,
        end,
        reservation.passengerCount,
      ),
      listAvailableDrivers(start, end),
    ]);
  }

  return (
    <ReservationDetailView
      reservation={reservation}
      currentUser={user}
      context="admin"
      alerts={alerts}
      availableVehicles={availableVehicles}
      availableDrivers={availableDrivers}
    />
  );
}
