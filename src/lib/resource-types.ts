export type ResourceCategoryOption = { id: string; name: string; code: string; isVehicle: boolean };
export type CategoryRecord = ResourceCategoryOption & { description: string | null; updatedAt: string; resourceCount: number; reservationCount: number };
export type ResourceRecord = {
  id: string; name: string; resourceCode: string; categoryId: string; capacity: number | null;
  location: string | null; isActive: boolean; requiresApproval: boolean; updatedAt: string;
  imageUrl: string | null; imagePath: string | null;
  category: ResourceCategoryOption;
};
export type ResourceFilters = { q: string; categoryId: string; status: "ALL" | "ACTIVE" | "INACTIVE"; page: number };
export type ResourceField = "name" | "code" | "resourceCode" | "description" | "categoryId" | "capacity" | "location" | "isVehicle" | "isActive" | "requiresApproval" | "imageUrl" | "imagePath";
export type ResourceActionResult = { error?: string; fieldErrors?: Partial<Record<ResourceField, string>> };
