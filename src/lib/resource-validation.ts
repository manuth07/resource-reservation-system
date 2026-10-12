import "server-only";
import type { ResourceFilters } from "@/lib/resource-types";

export class ResourceManagementError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validResourceId(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
export function resourceId(value: unknown) {
  if (!validResourceId(value)) throw new ResourceManagementError("Choose a valid record.");
  return value;
}
function text(value: unknown, label: string, limit: number, optional = false) {
  if (typeof value !== "string") throw new ResourceManagementError(`Enter a valid ${label}.`);
  const cleaned = value.trim();
  if ((!optional && !cleaned) || cleaned.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleaned)) throw new ResourceManagementError(`${label} must ${optional ? "contain at most" : "contain 1–"}${optional ? " " : ""}${limit} characters.`);
  return cleaned;
}
function code(value: unknown) {
  const normalized = text(value, "Code", 64).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(normalized)) throw new ResourceManagementError("Code must be 2–64 letters, numbers, hyphens or underscores, starting with a letter or number.");
  return normalized;
}
export function booleanValue(value: unknown) {
  if (typeof value !== "boolean") throw new ResourceManagementError("Choose a valid option.");
  return value;
}
export function revision(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new ResourceManagementError("Reload the record before editing.");
  return new Date(value);
}
export function parseCategory(input: Record<string, unknown>) {
  return { code: code(input.code), name: text(input.name, "Category name", 100), description: text(input.description, "Description", 2000, true) || null, isVehicle: booleanValue(input.isVehicle) };
}
export function parseResource(input: Record<string, unknown>) {
  const raw = text(input.capacity, "Capacity", 10, true);
  if (raw && (!/^[1-9]\d*$/.test(raw) || Number(raw) > 2147483647)) throw new ResourceManagementError("Capacity must be a positive whole number no greater than 2147483647, or left empty.");
  return { resourceCode: code(input.resourceCode), name: text(input.name, "Resource name", 120), categoryId: resourceId(input.categoryId), capacity: raw ? Number(raw) : null, location: text(input.location, "Location", 200, true) || null, isActive: booleanValue(input.isActive), requiresApproval: booleanValue(input.requiresApproval) };
}
export function parseResourceFilters(input: Record<string, string | string[] | undefined>): ResourceFilters {
  const scalar = (key: string) => {
    if (Array.isArray(input[key])) throw new ResourceManagementError("Choose one value per filter.");
    return typeof input[key] === "string" ? input[key] as string : "";
  };
  const categoryId = scalar("category");
  if (categoryId) resourceId(categoryId);
  const status = scalar("status") || "ALL";
  if (!["ALL", "ACTIVE", "INACTIVE"].includes(status)) throw new ResourceManagementError("Choose a valid operational status.");
  const page = scalar("page") || "1";
  if (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000) throw new ResourceManagementError("Choose a valid page.");
  return { q: text(scalar("q"), "Search", 100, true), categoryId, status: status as ResourceFilters["status"], page: Number(page) };
}
// Prisma's PostgreSQL contains filter uses ILIKE. Escape pattern metacharacters
// so user searches remain literal substrings, including %, _ and backslash.
export function literalSearch(value: string) { return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"); }
