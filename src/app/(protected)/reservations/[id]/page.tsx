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

export default function ReservationDetailPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Reservation details" variant="detail" />}>
      <ReservationDetailContent {...props} />
    </Suspense>
  );
}

async function ReservationDetailContent({ params, searchParams }: Props) {
  await connection();
  const user = await requirePageUser();

  const { id } = await params;
  const alerts = await searchParams;

  const reservation = await getReservation(id);

  if (!reservation) {
    notFound();
  }

  const isOwner = user.id === reservation.requesterId;
  const isAdmin = user.role === UserRole.ADMIN;
  const isDepartmentHeadForReservation =
    user.role === UserRole.DEPARTMENT_HEAD &&
    reservation.department.headId === user.id;

  if (!isOwner && !isAdmin && !isDepartmentHeadForReservation) {
    notFound();
  }

  let availableVehicles: Awaited<ReturnType<typeof listAvailableVehicles>> = [];
  let availableDrivers: Awaited<ReturnType<typeof listAvailableDrivers>> = [];

  const isApprovedVehicleAwaitingAllocation =
    isAdmin &&
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
      context="workspace"
      alerts={alerts}
      availableVehicles={availableVehicles}
      availableDrivers={availableDrivers}
    />
  );
}
