import { NavigationLink as Link } from "@/components/navigation-link";
import { Card, DataTable, EmptyState, Feedback, FormField, Input, Select, StatusBadge, Button } from "@/components/ui";
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
  try { data = await Promise.all([listCategoryOptions(), listResources(searchParams, admin)]); }
  catch (error) {
    if (!(error instanceof ResourceManagementError)) throw error;
    return <p role="alert" className="feedback feedback-danger">{error.message} <Link href={base} className="text-link">Clear filters</Link></p>;
  }
  const [categories, result] = data;
  const { filters, resources, total, pages } = result;
  return (
    <div className="space-y-6">
      {searchParams.saved === "1" && admin && <Feedback tone="success">Resource saved successfully.</Feedback>}
      <p className="text-sm text-secondary">Operational status is separate from availability for a selected date and time.</p>
      <Card className="p-6">
        <form method="get" action={base} className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(160px,2fr)_minmax(160px,1fr)_minmax(160px,1fr)_auto]">
          <FormField id="resource-search" label="Search by name or code"><Input id="resource-search" name="q" defaultValue={filters.q} maxLength={100} type="search" /></FormField>
          <FormField id="category-filter" label="Category"><Select id="category-filter" name="category" defaultValue={filters.categoryId}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></FormField>
          <FormField id="status-filter" label="Operational status"><Select id="status-filter" name="status" defaultValue={filters.status}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></FormField>
          <div className="flex flex-wrap gap-2"><Button type="submit">Apply filters</Button><Link href={base} className="button button-secondary">Clear</Link></div>
        </form>
      </Card>
      <Card>
        <div className="p-6"><h2 className="section-title">{admin ? "Resource directory" : "Resource catalog"} <span className="text-base text-muted tabular-nums">({total})</span></h2></div>
        {!resources.length ? <EmptyState title={filters.page > pages ? "No results on this page" : "No resources found"} description={filters.q || filters.categoryId || filters.status !== "ALL" ? "Try another search or clear the filters." : admin ? "Create a category, then add your organization's resources." : "Your administrator has not added resources yet."} action={<Link className="text-link" href={base}>Reset catalog view</Link>} /> : (
          <DataTable label={admin ? "Resource directory" : "Resource catalog"} className="resource-table">
            <thead><tr><th scope="col">Resource</th><th scope="col">Category</th><th scope="col">Capacity / location</th><th scope="col">Booking policy</th><th scope="col">Status</th>{admin && <th scope="col" className="w-64">Actions</th>}</tr></thead>
            <tbody>{resources.map((resource) => (
              <tr key={resource.id}>
                <td><Link className="text-link text-foreground font-semibold" href={`/resources/${resource.id}`}>{resource.name}</Link><p className="supporting-text mt-2">{resource.resourceCode}</p></td>
                <td><StatusBadge subtle>{resource.category.name}</StatusBadge>{resource.category.isVehicle && <p className="supporting-text mt-2">Vehicle / Transport</p>}</td>
                <td className="text-secondary"><p>{resource.capacity === null ? "Capacity not specified" : `Capacity: ${resource.capacity}`}</p>{!resource.category.isVehicle && <p className="supporting-text mt-2">{resource.location ?? "Location not specified"}</p>}</td>
                <td><StatusBadge tone={resource.requiresApproval ? "warning" : "accent"}>{resource.requiresApproval ? "Approval required" : "Direct booking"}</StatusBadge></td>
                <td><StatusBadge tone={resource.isActive ? "success" : "neutral"}>{resource.isActive ? "Active" : "Inactive"}</StatusBadge></td>
                {admin && <td><div className="flex flex-wrap items-start gap-2 md:min-w-52 md:flex-nowrap"><Link className="button button-neutral whitespace-nowrap" href={`/admin/resources/${resource.id}/edit`}>Edit <span className="sr-only">{resource.name}</span></Link><ResourceStatusControl resource={resource} /></div></td>}
              </tr>
            ))}</tbody>
          </DataTable>
        )}
        <nav aria-label="Resource pagination" className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-6">
          <p className="text-sm text-muted tabular-nums">Page {filters.page} of {pages} · {total} resources · Up to 50 per page</p>
          <div className="flex gap-4">{filters.page > 1 && <Link className="text-link" href={pageUrl(base, filters, Math.min(filters.page - 1, pages))}>Previous</Link>}{filters.page < pages && <Link className="text-link" href={pageUrl(base, filters, filters.page + 1)}>Next</Link>}</div>
        </nav>
      </Card>
    </div>
  );
}
