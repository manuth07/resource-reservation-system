import type { UserRole, AccountStatus } from "@/generated/prisma/enums";

export type DepartmentHeadSummary = {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
};

export type DepartmentMemberSummary = {
  id: string;
  name: string;
  employeeId: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
};

export type DepartmentRecord = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  headId: string | null;
  head: DepartmentHeadSummary | null;
  employeeCount: number;
  reservationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DepartmentDetailRecord = DepartmentRecord & {
  members: DepartmentMemberSummary[];
};

export type CreateDepartmentInput = {
  name: string;
  code: string;
  description?: string | null;
  headId?: string | null;
};

export type UpdateDepartmentInput = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
};

export type DepartmentActionResult = {
  departmentId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type EmployeeTransferInput = {
  userId: string;
  targetDepartmentId: string;
  newRole?: UserRole;
};
