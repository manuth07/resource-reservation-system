import { Suspense } from "react";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { listDepartments } from "@/lib/department-service";
import {
  Card,
  DataTable,
  EmptyState,
  Feedback,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { PageLoading } from "@/components/page-loading";

type Props = {
  searchParams: Promise<{ saved?: string }>;
};

export default function DepartmentsPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Departments" variant="table" />}>
      <DepartmentsContent {...props} />
    </Suspense>
  );
}

async function DepartmentsContent({ searchParams }: Props) {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  const [departments, params] = await Promise.all([
    listDepartments(),
    searchParams,
  ]);

  return (
    <>
      <PageHeader
        section="Administration"
        title="Departments"
        description="Manage organizational departments and designated department heads for approval routing."
        action={
          <Link className="button button-primary" href="/admin/departments/new">
            Create department
          </Link>
        }
      />

      {params.saved === "1" && (
        <Feedback tone="success" className="mb-6">
          Department saved successfully.
        </Feedback>
      )}

      <Card>
        <div className="directory-header">
          <h2 className="card-title">Department directory</h2>
          <p className="directory-count">
            {departments.length}{" "}
            {departments.length === 1 ? "department" : "departments"}
          </p>
        </div>

        {departments.length === 0 ? (
          <EmptyState
            title="No departments found"
            description="Create a department such as Information Technology or Operations to get started."
            action={
              <Link className="button button-primary" href="/admin/departments/new">
                Create department
              </Link>
            }
          />
        ) : (
          <DataTable label="Departments directory">
            <thead>
              <tr>
                <th scope="col">Department</th>
                <th scope="col">Code</th>
                <th scope="col">Department Head</th>
                <th scope="col" className="w-28 text-right">
                  Employees
                </th>
                <th scope="col" className="w-28 text-right">
                  Requests
                </th>
                <th scope="col" className="w-32 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept.id}>
                  <td>
                    <p className="font-semibold text-foreground">{dept.name}</p>
                    {dept.description && (
                      <p className="category-description mt-0.5">{dept.description}</p>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-xs font-semibold text-foreground bg-table-header px-2 py-1 rounded">
                      {dept.code}
                    </span>
                  </td>
                  <td>
                    {dept.head ? (
                      <div>
                        <p className="font-medium text-foreground">
                          {dept.head.name}
                        </p>
                        <p className="text-xs text-secondary">
                          {dept.head.employeeId} • {dept.head.email}
                        </p>
                      </div>
                    ) : (
                      <StatusBadge tone="warning" subtle>
                        Unassigned
                      </StatusBadge>
                    )}
                  </td>
                  <td className="tabular-nums text-right font-medium">
                    {dept.employeeCount}
                  </td>
                  <td className="tabular-nums text-right font-medium">
                    {dept.reservationCount}
                  </td>
                  <td className="text-right">
                    <Link
                      className="button button-neutral button-sm whitespace-nowrap min-w-16"
                      href={`/admin/departments/${dept.id}/edit`}
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
