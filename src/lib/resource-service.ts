import "server-only";
import { AccountStatus, UserRole, type Prisma } from "@/generated/prisma/client";
import { AuthorizationError, requireAuthenticatedUser, requireRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ResourceManagementError, booleanValue, literalSearch, parseCategory, parseResource, parseResourceFilters, resourceId, revision, validResourceId } from "@/lib/resource-validation";
import type { CategoryRecord, ResourceCategoryOption, ResourceRecord } from "@/lib/resource-types";

const categorySelect = { id: true, name: true, code: true, isVehicle: true } as const;
const resourceSelect = { id: true, name: true, resourceCode: true, categoryId: true, capacity: true, location: true, isActive: true, requiresApproval: true, updatedAt: true, category: { select: categorySelect } } as const;
const categoryAdminSelect = { ...categorySelect, description: true, updatedAt: true, _count: { select: { resources: true, reservations: true } } } as const;
function categoryDto(row: Prisma.ResourceCategoryGetPayload<{ select: typeof categoryAdminSelect }>): CategoryRecord {
  return { id: row.id, name: row.name, code: row.code, description: row.description, isVehicle: row.isVehicle, updatedAt: row.updatedAt.toISOString(), resourceCount: row._count.resources, reservationCount: row._count.reservations };
}
function resourceDto(row: Prisma.ResourceGetPayload<{ select: typeof resourceSelect }>): ResourceRecord { return { ...row, updatedAt: row.updatedAt.toISOString() }; }

export async function listCategoryOptions(): Promise<ResourceCategoryOption[]> {
  await requireAuthenticatedUser();
  return prisma.resourceCategory.findMany({ select: categorySelect, orderBy: { name: "asc" } });
}
export async function listCategories(): Promise<CategoryRecord[]> {
  await requireRole(UserRole.ADMIN);
  return (await prisma.resourceCategory.findMany({ select: categoryAdminSelect, orderBy: { name: "asc" } })).map(categoryDto);
}
export async function getCategory(id: string): Promise<CategoryRecord | null> {
  await requireRole(UserRole.ADMIN);
  if (!validResourceId(id)) return null;
  const row = await prisma.resourceCategory.findUnique({ where: { id }, select: categoryAdminSelect });
  return row ? categoryDto(row) : null;
}
export async function listResources(input: Record<string, string | string[] | undefined>, admin = false) {
  if (admin) await requireRole(UserRole.ADMIN); else await requireAuthenticatedUser();
  const filters = parseResourceFilters(input);
  const search = literalSearch(filters.q);
  const where: Prisma.ResourceWhereInput = {
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status === "ALL" ? {} : { isActive: filters.status === "ACTIVE" }),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { resourceCode: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.resource.findMany({ where, select: resourceSelect, orderBy: [{ name: "asc" }, { id: "asc" }], take: 50, skip: (filters.page - 1) * 50 }),
    prisma.resource.count({ where }),
  ]);
  return { resources: rows.map(resourceDto), total, filters, pages: Math.max(1, Math.ceil(total / 50)) };
}
export async function getResource(id: string): Promise<ResourceRecord | null> {
  await requireAuthenticatedUser();
  if (!validResourceId(id)) return null;
  const row = await prisma.resource.findUnique({ where: { id }, select: resourceSelect });
  return row ? resourceDto(row) : null;
}
async function policyReferences(tx: Prisma.TransactionClient, id: string, categoryId: string) {
  // Category-only requests also lack a policy snapshot. Keep their history safe.
  return tx.reservation.count({ where: { OR: [{ resourceId: id }, { requestedCategoryId: categoryId, resourceId: null }] } });
}
export async function getResourceForEdit(id: string) {
  await requireRole(UserRole.ADMIN);
  const resource = await getResource(id);
  return resource ? { resource, policyLocked: (await policyReferences(prisma, id, resource.categoryId)) > 0 } : null;
}

async function mutation<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  const actor = await requireRole(UserRole.ADMIN);
  await enforceRateLimit("resource-management", actor.id, 60, 60_000);
  try {
    return await prisma.$transaction(async (tx) => {
      // All category/resource writes share this lock, across processes. Database
      // unique keys remain the final guard against exact-code races.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(742019, 3)`;
      await tx.$queryRaw`SELECT "id" FROM "public"."User" WHERE "id" = ${actor.id}::uuid FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, accountStatus: true, mustChangePassword: true, sessionVersion: true } });
      if (!current || current.role !== UserRole.ADMIN || current.accountStatus !== AccountStatus.ACTIVE || current.mustChangePassword || current.sessionVersion !== actor.sessionVersion) throw new AuthorizationError("FORBIDDEN", 403);
      return run(tx);
    }, { maxWait: 5000, timeout: 10000, isolationLevel: "ReadCommitted" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "P2002") throw new ResourceManagementError("A code or category name is already in use. Reload and choose another value.");
    if (code === "P2003" || code === "P2025") throw new ResourceManagementError("A referenced record changed. Reload the page and try again.");
    if (code === "P2034" || code === "P2028") throw new ResourceManagementError("Another operation is in progress. Reload and try again.");
    throw error;
  }
}
function unchanged(current: Date, expected: unknown) {
  if (current.getTime() !== revision(expected).getTime()) throw new ResourceManagementError("This record was changed by another administrator. Reload before editing.");
}
export async function saveCategory(input: Record<string, unknown>, id?: string, expectedRevision?: string) {
  return mutation(async (tx) => {
    const data = parseCategory(input);
    if (id) resourceId(id);
    const duplicates = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."ResourceCategory"
      WHERE (upper(btrim("code")) = ${data.code} OR lower(btrim("name")) = lower(${data.name}))
        AND (${id ?? null}::uuid IS NULL OR "id" <> ${id ?? null}::uuid) LIMIT 1
    `;
    if (duplicates.length) throw new ResourceManagementError("A category code or name is already in use.");
    if (!id) return tx.resourceCategory.create({ data, select: { id: true } });
    // FOR UPDATE conflicts with FK insertion locks, so a new reference cannot
    // sneak between the reference check and a classification change.
    await tx.$queryRaw`SELECT "id" FROM "public"."ResourceCategory" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = await tx.resourceCategory.findUnique({ where: { id }, select: categoryAdminSelect });
    if (!current) throw new ResourceManagementError("Category not found.");
    unchanged(current.updatedAt, expectedRevision);
    const referenced = current._count.resources || current._count.reservations;
    if (referenced && (data.code !== current.code.trim().toUpperCase() || data.isVehicle !== current.isVehicle)) throw new ResourceManagementError("Referenced categories cannot change code or vehicle classification. Create a new category instead.");
    if (referenced) data.code = current.code; // retain the original historical identifier, including legacy casing
    await tx.resourceCategory.update({ where: { id }, data }); // metadata is preserved
    return { id };
  });
}
export async function saveResource(input: Record<string, unknown>, id?: string, expectedRevision?: string) {
  return mutation(async (tx) => {
    const data = parseResource(input);
    if (id) resourceId(id);
    const duplicates = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "public"."Resource" WHERE upper(btrim("resourceCode")) = ${data.resourceCode}
        AND (${id ?? null}::uuid IS NULL OR "id" <> ${id ?? null}::uuid) LIMIT 1
    `;
    if (duplicates.length) throw new ResourceManagementError("A resource code is already in use.");
    if (id) await tx.$queryRaw`SELECT "id" FROM "public"."Resource" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = id ? await tx.resource.findUnique({ where: { id } }) : null;
    if (id && !current) throw new ResourceManagementError("Resource not found.");
    if (current) unchanged(current.updatedAt, expectedRevision);
    for (const category of [...new Set([data.categoryId, ...(current ? [current.categoryId] : [])])].sort()) {
      await tx.$queryRaw`SELECT "id" FROM "public"."ResourceCategory" WHERE "id" = ${category}::uuid FOR UPDATE`;
    }
    const category = await tx.resourceCategory.findUnique({ where: { id: data.categoryId }, select: categorySelect });
    if (!category) throw new ResourceManagementError("Choose an existing category.");
    if (category.isVehicle && !data.requiresApproval) throw new ResourceManagementError("Vehicles must require approval and later administrator assignment.");
    if (current && (data.categoryId !== current.categoryId || data.requiresApproval !== current.requiresApproval) && await policyReferences(tx, current.id, current.categoryId)) throw new ResourceManagementError("Reservation history or category-only requests prevent changing this resource's category or approval policy.");
    if (!id) return tx.resource.create({ data, select: { id: true } });
    await tx.resource.update({ where: { id }, data });
    return { id };
  });
}
export async function setResourceActive(id: string, active: boolean, expectedRevision: string) {
  return mutation(async (tx) => {
    resourceId(id); booleanValue(active);
    await tx.$queryRaw`SELECT "id" FROM "public"."Resource" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const current = await tx.resource.findUnique({ where: { id } });
    if (!current) throw new ResourceManagementError("Resource not found.");
    unchanged(current.updatedAt, expectedRevision);
    await tx.resource.update({ where: { id }, data: { isActive: active } });
    return { id };
  });
}
