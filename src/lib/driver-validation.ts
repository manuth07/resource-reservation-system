export class DriverError extends Error {
  constructor(
    message: string,
    public readonly field?: "name" | "driverIdentifier" | "phone" | "email",
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "DriverError";
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/;
const PHONE_CHARS_REGEX = /^\+?[0-9\s\-()]{7,25}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export function validateDriverName(name: unknown): string {
  if (typeof name !== "string") {
    throw new DriverError("Driver name is required.", "name");
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new DriverError("Driver name is required.", "name");
  }
  if (trimmed.length < 2) {
    throw new DriverError("Driver name must be at least 2 characters.", "name");
  }
  if (trimmed.length > 100) {
    throw new DriverError("Driver name must not exceed 100 characters.", "name");
  }
  return trimmed;
}

export function validateDriverIdentifier(identifier: unknown): string {
  if (typeof identifier !== "string") {
    throw new DriverError("Driver identifier is required.", "driverIdentifier");
  }
  const trimmed = identifier.trim().toUpperCase();
  if (!trimmed) {
    throw new DriverError("Driver identifier is required.", "driverIdentifier");
  }
  if (!IDENTIFIER_REGEX.test(trimmed)) {
    throw new DriverError(
      "Driver identifier must be 2–20 alphanumeric characters, hyphens, or underscores, starting with a letter or number.",
      "driverIdentifier",
    );
  }
  return trimmed;
}

export function validateDriverPhone(phone: unknown): string {
  if (typeof phone !== "string") {
    throw new DriverError("Phone number is required.", "phone");
  }
  const trimmed = phone.trim();
  if (!trimmed) {
    throw new DriverError("Phone number is required.", "phone");
  }
  // Check phone pattern and ensure it has at least 7 digits
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (!PHONE_CHARS_REGEX.test(trimmed) || digitCount < 7) {
    throw new DriverError(
      "Please enter a valid phone number (7–25 digits, optional international '+' prefix).",
      "phone",
    );
  }
  return trimmed;
}

export function validateDriverEmail(email: unknown): string | null {
  if (email === undefined || email === null || email === "") {
    return null;
  }
  if (typeof email !== "string") {
    throw new DriverError("Email must be a valid text string.", "email");
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > 150) {
    throw new DriverError("Email address must not exceed 150 characters.", "email");
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new DriverError("Please enter a valid email address.", "email");
  }
  return trimmed;
}
