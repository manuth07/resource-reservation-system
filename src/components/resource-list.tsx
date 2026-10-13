import Image from "next/image";
import { isTrustedBlobUrl } from "@/lib/storage-utils";
import { NavigationLink as Link } from "@/components/navigation-link";
import { Card, DataTable, EmptyState, Feedback, FormField, Input, Select, StatusBadge, Button, CategoryBadge } from "@/components/ui";
import { ResourceStatusControl } from "@/components/resource-status-control";
import { listCategoryOptions, listResources } from "@/lib/resource-service";
import { ResourceManagementError } from "@/lib/resource-validation";
import type { ResourceFilters } from "@/lib/resource-types";

function pageUrl(base: string, filters: ResourceFilters, page: number) {
  const params = new URLSearchParams({ q: filters.q, category: filters.categoryId, status: filters.status, page: String(page) });
  return `${base}?${params}`;
}

export async function ResourceList({ searchParams, admin = false }: { searchParams: Record<string, string | string[] | undefined>; admin?: boolean }) {
  const base = admin ? "/admin/resources" : "/resources";
  let data;
  try {
    data = await Promise.all([listCategoryOptions(), listResources(searchParams, admin)]);
  } catch (error) {
    if (!(error instanceof ResourceManagementError)) throw error;
    return (
      <Feedback tone="danger">
        {error.message} <Link href={base} className="text-link">Clear filters</Link>
      </Feedback>
    );
  }

  const [categories, result] = data;
  const { filters, resources, total, pages } = result;
  const filtered = !!filters.q || !!filters.categoryId || filters.status !== "ALL";

  return (
    <div className="space-y-4">
      {searchParams.saved === "1" && admin && (
        <Feedback tone="success">Resource saved successfully.</Feedback>
      )}

      <Card>
        <div className="directory-header">
          <h2 className="card-title">{admin ? "Resource directory" : "Explore resources"}</h2>
          <p className="directory-count">
            {total} {total === 1 ? "resource" : "resources"}{filtered ? " matching filters" : ""}
          </p>
        </div>

        <div className="directory-toolbar">
          <form method="get" action={base} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(160px,200px)_minmax(140px,180px)_auto]">
            <FormField id="resource-search" label="Search">
              <Input
                id="resource-search"
                name="q"
                defaultValue={filters.q}
                maxLength={100}
                type="search"
                placeholder="Resource name or code"
                aria-label="Search by resource name or code"
              />
            </FormField>

            <FormField id="category-filter" label="Category">
              <Select id="category-filter" name="category" defaultValue={filters.categoryId}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField id="status-filter" label="Operational status">
              <Select id="status-filter" name="status" defaultValue={filters.status}>
                <option value="ALL">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </Select>
            </FormField>

            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" className="h-10 px-4">
                Apply
              </Button>
              <Link
                href={base}
                className="button button-secondary button-sm h-10 px-4 inline-flex items-center"
                aria-label="Clear resource filters"
              >
                Reset
              </Link>
            </div>
          </form>
        </div>

        {!resources.length ? (
          <EmptyState
            title={filters.page > pages ? "No results on this page" : "No resources found"}
            description={
              filtered
                ? "Try another search or clear the filters."
                : admin
                ? "Create a category, then add your organization's resources."
                : "Your administrator has not added resources yet."
            }
            action={
              <Link className="text-link" href={base}>
                Reset catalog view
              </Link>
            }
          />
        ) : (
          <DataTable label={admin ? "Resource directory" : "Resource catalog"} className="resource-table">
            <thead>
              <tr>
                <th scope="col">Resource</th>
                <th scope="col">Category</th>
                <th scope="col">Capacity / location</th>
                <th scope="col">Booking policy</th>
                <th scope="col">Operational status</th>
                {admin && <th scope="col" className="w-48">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      {resource.imageUrl ? (
                        <div className="relative size-14 shrink-0 overflow-hidden rounded border border-border bg-table-header">
                          <Image
                            src={resource.imageUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="size-full object-cover"
                            unoptimized={isTrustedBlobUrl(resource.imageUrl)}
                          />
                        </div>
                      ) : (
                        <div
                          className="flex size-14 shrink-0 items-center justify-center rounded border border-border bg-table-header text-secondary"
                          aria-hidden="true"
                        >
                          <svg className="size-5 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                          </svg>
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link className="text-link text-foreground font-semibold block truncate" href={`/resources/${resource.id}`}>
                          {resource.name}
                        </Link>
                        <p className="resource-code">{resource.resourceCode}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <CategoryBadge category={resource.category}>
                      {resource.category.name}
                    </CategoryBadge>
                  </td>
                  <td className="text-secondary">
                    <p className="tabular-nums font-medium">
                      {resource.capacity === null ? "Capacity not specified" : `Capacity: ${resource.capacity}`}
                    </p>
                    {!resource.category.isVehicle && (
                      <p className="supporting-text mt-0.5">{resource.location ?? "Location not specified"}</p>
                    )}
                  </td>
                  <td>
                    <StatusBadge tone={resource.requiresApproval ? "warning" : "accent"}>
                      {resource.requiresApproval ? "Approval required" : "Direct booking"}
                    </StatusBadge>
                  </td>
                  <td>
                    <StatusBadge tone={resource.isActive ? "success" : "neutral"}>
                      {resource.isActive ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  {admin && (
                    <td>
                      <div className="flex items-center gap-2 md:flex-nowrap">
                        <Link
                          className="button button-neutral button-sm whitespace-nowrap min-w-16"
                          href={`/admin/resources/${resource.id}/edit`}
                        >
                          Edit <span className="sr-only">{resource.name}</span>
                        </Link>
                        <ResourceStatusControl resource={resource} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        <nav aria-label="Resource pagination" className="directory-footer">
          <p className="directory-count">
            Page {filters.page} of {pages} · Up to 50 per page
          </p>
          <div className="flex gap-4">
            {filters.page > 1 && (
              <Link className="text-link" href={pageUrl(base, filters, Math.min(filters.page - 1, pages))}>
                Previous
              </Link>
            )}
            {filters.page < pages && (
              <Link className="text-link" href={pageUrl(base, filters, filters.page + 1)}>
                Next
              </Link>
            )}
          </div>
        </nav>
      </Card>

      <p className="supporting-text">
        Active means operationally enabled, not available for a particular date or time.
      </p>
    </div>
  );
}
