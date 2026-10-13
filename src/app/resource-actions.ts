"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { RateLimitError } from "@/lib/rate-limit";
import { ResourceManagementError } from "@/lib/resource-validation";
import { attachResourcePhoto, removeResourcePhoto, saveCategory, saveResource, setResourceActive } from "@/lib/resource-service";
import type { ResourceActionResult } from "@/lib/resource-types";

function field(data: FormData, key: string) { const value = data.get(key); return typeof value === "string" ? value : ""; }
function flag(data: FormData, key: string) {
  const value = data.get(key);
  if (value === null || value === "false") return false;
  if (value === "true") return true;
  throw new ResourceManagementError("Choose a valid option.");
}
function failure(error: unknown): ResourceActionResult {
  if (error instanceof ResourceManagementError) return { error: error.message, ...(error.field ? { fieldErrors: { [error.field]: error.message } } : {}) };
  if (error instanceof RateLimitError) return { error: error.message };
  if (error instanceof AuthorizationError) return { error: "Your session cannot perform this operation. Sign in again or finish your password change." };
  return { error: "The operation could not be completed. Please reload and try again." };
}
function invalidateResources(id: string) {
  revalidatePath("/resources");
  revalidatePath(`/resources/${id}`);
  revalidatePath("/admin/resources");
  revalidatePath("/admin/resource-categories");
}
export async function saveResourceAction(_previous: ResourceActionResult, data: FormData): Promise<ResourceActionResult> {
  let id: string;
  try {
    const removeImage = field(data, "removeImage") === "true";
    const imageUrl = field(data, "imageUrl");
    const imagePath = field(data, "imagePath");
    const result = await saveResource({
      name: field(data, "name"),
      resourceCode: field(data, "resourceCode"),
      categoryId: field(data, "categoryId"),
      capacity: field(data, "capacity"),
      location: field(data, "location"),
      isActive: flag(data, "isActive"),
      requiresApproval: flag(data, "requiresApproval"),
      ...(removeImage ? { removeImage: true } : (imageUrl ? { imageUrl, imagePath } : {})),
    }, field(data, "id") || undefined, field(data, "updatedAt"));
    id = result.id;
  } catch (error) { return failure(error); }
  invalidateResources(id);
  redirect("/admin/resources?saved=1");
}

export async function removeResourcePhotoAction(data: FormData): Promise<ResourceActionResult> {
  const id = field(data, "id");
  const updatedAt = field(data, "updatedAt");
  try {
    await removeResourcePhoto(id, updatedAt);
  } catch (error) {
    return failure(error);
  }
  invalidateResources(id);
  return {};
}

export async function attachResourcePhotoAction(data: FormData): Promise<ResourceActionResult> {
  const id = field(data, "id");
  const imageUrl = field(data, "imageUrl");
  const imagePath = field(data, "imagePath");
  const updatedAt = field(data, "updatedAt");
  try {
    await attachResourcePhoto(id, imageUrl, imagePath, updatedAt);
  } catch (error) {
    return failure(error);
  }
  invalidateResources(id);
  return {};
}
export async function saveCategoryAction(_previous: ResourceActionResult, data: FormData): Promise<ResourceActionResult> {
  try { await saveCategory({ name: field(data, "name"), code: field(data, "code"), description: field(data, "description"), isVehicle: flag(data, "isVehicle") }, field(data, "id") || undefined, field(data, "updatedAt")); }
  catch (error) { return failure(error); }
  revalidatePath("/admin/resource-categories");
  revalidatePath("/admin/resources");
  revalidatePath("/admin/resources/new");
  revalidatePath("/resources");
  revalidatePath("/resources/[id]", "page");
  redirect("/admin/resource-categories?saved=1");
}
export async function setResourceActiveAction(data: FormData): Promise<ResourceActionResult> {
  let id: string;
  try { id = (await setResourceActive(field(data, "id"), flag(data, "active"), field(data, "updatedAt"))).id; }
  catch (error) { return failure(error); }
  invalidateResources(id);
  return {};
}
