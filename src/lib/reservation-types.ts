import type {
  ApprovalDecision,
  ApprovalStage,
  ReservationStatus,
} from "@/generated/prisma/enums";

export type DisplayReservationStatus =
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "PENDING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type ReservationCategorySummary = {
  id: string;
  name: string;
  code: string;
  isVehicle: boolean;
};

export type ReservationResourceSummary = {
  id: string;
  name: string;
  resourceCode: string;
  location: string | null;
  capacity: number | null;
  imageUrl: string | null;
  requiresApproval: boolean;
  isActive: boolean;
  category: ReservationCategorySummary;
};

export type ReservationUserSummary = {
  id: string;
  name: string;
  email: string;
  employeeId: string;
};

export type ReservationDepartmentSummary = {
  id: string;
  name: string;
  code: string;
  headId?: string | null;
};

export type ApprovalRecord = {
  id: string;
  reservationId: string;
  approverId: string;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  rejectionReason: string | null;
  decidedAt: string;
  approver: ReservationUserSummary;
};

export type ReservationRecord = {
  id: string;
  requesterId: string;
  departmentId: string;
  requestedCategoryId: string;
  resourceId: string | null;
  driverId: string | null;
  startTime: string; // ISO 8601 UTC string
  endTime: string;   // ISO 8601 UTC string
  purpose: string;
  destination: string | null;
  passengerCount: number | null;
  status: ReservationStatus;
  displayStatus: DisplayReservationStatus;
  createdAt: string;
  updatedAt: string;
  requester: ReservationUserSummary;
  department: ReservationDepartmentSummary;
  requestedCategory: ReservationCategorySummary;
  resource: ReservationResourceSummary | null;
  approvals: ApprovalRecord[];
};

export type DirectBookingInput = {
  resourceId: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  purpose: string;
};

export type ReservationTabFilter = "upcoming" | "past" | "cancelled" | "all";

export type AdminReservationQueueTab =
  | "pending"
  | "awaiting_hod"
  | "approved"
  | "all";

export type ReservationListResult = {
  reservations: ReservationRecord[];
  total: number;
  tab: string;
  page: number;
  pages: number;
};

export type ReservationField =
  | "resourceId"
  | "date"
  | "startTime"
  | "endTime"
  | "purpose"
  | "rejectionReason"
  | "destination"
  | "passengerCount";

export type ReservationActionResult = {
  error?: string;
  fieldErrors?: Partial<Record<ReservationField, string>>;
  reservationId?: string;
  isApprovalRequired?: boolean;
};
