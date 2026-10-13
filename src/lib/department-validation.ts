export class DepartmentError extends Error {
  constructor(
    message: string,
    public readonly field?: "name" | "code" | "description" | "headId" | "targetDepartmentId",
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "DepartmentError";
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export function validateDepartmentName(name: unknown): string {
  if (typeof name !== "string") {
    throw new DepartmentError("Department name is required.", "name");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new DepartmentError("Department name is required.", "name");
  }
  if (trimmed.length < 2) {
    throw new DepartmentError("Department name must be at least 2 characters.", "name");
  }
  if (trimmed.length > 100) {
    throw new DepartmentError("Department name must not exceed 100 characters.", "name");
  }
  return trimmed;
}

export function validateDepartmentCode(code: unknown): string {
  if (typeof code !== "string") {
    throw new DepartmentError("Department code is required.", "code");
  }
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) {
    throw new DepartmentError("Department code is required.", "code");
  }
  if (!CODE_REGEX.test(trimmed)) {
    throw new DepartmentError(
      "Department code must be 2–20 alphanumeric characters, hyphens, or underscores, starting with a letter or number.",
      "code",
    );
  }
  return trimmed;
}

export function validateDepartmentDescription(description: unknown): string | null {
  if (description === undefined || description === null || description === "") {
    return null;
  }
  if (typeof description !== "string") {
    throw new DepartmentError("Description must be a valid text string.", "description");
  }
  const trimmed = description.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new DepartmentError("Description must not exceed 500 characters.", "description");
  }
  return trimmed;
}
