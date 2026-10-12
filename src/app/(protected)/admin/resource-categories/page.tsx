import { NavigationLink as Link } from "@/components/navigation-link";
import { connection } from "next/server";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { listCategories } from "@/lib/resource-service";
import { Card, DataTable, EmptyState, Feedback, PageHeader, CategoryBadge } from "@/components/ui";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function CategoriesPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Resource categories" />}>
      <CategoriesContent {...props} />
    </Suspense>
  );
}

async function CategoriesContent({ searchParams }: Props) {
  await connection();
  await requirePageUser(UserRole.ADMIN);
  const [categories, params] = await Promise.all([listCategories(), searchParams]);

  return (
    <>
      <PageHeader
        title="Resource categories"
        description="Organize resources by type and booking workflow."
        action={
          <Link className="button button-primary" href="/admin/resource-categories/new">
            Create category
          </Link>
        }
      />
      {params.saved === "1" && (
        <Feedback tone="success" className="mb-6">
          Category saved successfully.
        </Feedback>
      )}
      <Card>
        <div className="directory-header">
          <h2 className="card-title">Category directory</h2>
          <p className="directory-count">
            {categories.length} {categories.length === 1 ? "category" : "categories"}
          </p>
        </div>
        {!categories.length ? (
          <EmptyState
            title="No resource categories"
            description="Create a category such as Meeting Rooms or Vans before adding resources."
          />
        ) : (
          <DataTable label="Resource categories">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Classification</th>
                <th scope="col" className="w-28 text-right">
                  Resources
                </th>
                <th scope="col" className="w-28 text-right">
                  Requests
                </th>
                <th scope="col" className="w-32">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <p className="font-semibold text-foreground">{category.name}</p>
                    <p className="resource-code">{category.code}</p>
                    {category.description && (
                      <p className="category-description">{category.description}</p>
                    )}
                  </td>
                  <td>
                    <CategoryBadge category={{ isVehicle: category.isVehicle, name: category.name, code: category.code }}>
                      {category.isVehicle ? "Vehicle / Transport" : "Standard resource"}
                    </CategoryBadge>
                    {Boolean(category.resourceCount || category.reservationCount) && (
                      <p className="supporting-text mt-1">Classification protected</p>
                    )}
                  </td>
                  <td className="tabular-nums text-right font-medium">{category.resourceCount}</td>
                  <td className="tabular-nums text-right font-medium">{category.reservationCount}</td>
                  <td>
                    <Link
                      className="button button-neutral button-sm whitespace-nowrap min-w-16"
                      href={`/admin/resource-categories/${category.id}/edit`}
                    >
                      Edit <span className="sr-only">{category.name}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
      <p className="supporting-text mt-6">
        Categories are retained to protect resource and reservation relationships. There is no category deletion operation.
      </p>
    </>
  );
}
