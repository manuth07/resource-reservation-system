export type DriverRecord = {
  id: string;
  name: string;
  driverIdentifier: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  reservationCount: number;
  activeReservationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SaveDriverInput = {
  id?: string;
  name: string;
  driverIdentifier: string;
  phone: string;
  email?: string | null;
};

export type DriverActionResult = {
  success?: boolean;
  driverId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type DriverFilterOptions = {
  q?: string;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
};
