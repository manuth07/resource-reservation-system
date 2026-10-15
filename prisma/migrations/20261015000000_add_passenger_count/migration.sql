-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN "passengerCount" INTEGER;

-- Custom PostgreSQL integrity constraint
ALTER TABLE "Reservation"
    ADD CONSTRAINT "Reservation_positive_passenger_count_check"
    CHECK ("passengerCount" IS NULL OR "passengerCount" > 0);
