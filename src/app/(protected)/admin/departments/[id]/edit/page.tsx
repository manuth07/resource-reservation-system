import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { NavigationLink as Link } from "@/components/navigation-link";
import { UserRole } from "@/generated/prisma/enums";
import { requirePageUser } from "@/lib/page-auth";
import { getDepartment } from "@/lib/department-service";
import {
  Card,
  DataTable,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import { DepartmentForm } from "@/components/department-form";
import { DepartmentHeadControl } from "@/components/department-head-control";

type Props = {
  params: Promise<{ id: string }>;
};

export default function EditDepartmentPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading title="Manage department" variant="detail" />}>
      <EditDepartmentContent {...props} />
    </Suspense>
  );
}

async function EditDepartmentContent({ params }: Props) {
  await connection();
  await requirePageUser(UserRole.ADMIN);

  const { id } = await params;
  const department = await getDepartment(id);

  if (!department) {
    notFound();
  }

  return (
    <>
      <PageHeader
        section="Departments"
        title={`Manage ${department.name}`}
        description={`Code: ${department.code} • ${department.employeeCount} total employees • ${department.reservationCount} historical requests`}
        action={
          <Link href="/admin/departments" className="button button-neutral">
            Back to directory
          </Link>
        }
      />

      <div className="max-w-3xl space-y-8">
        {/* Department Name, Code, and Description Form */}
        <DepartmentForm department={department} />

        {/* Department Head Designation Control */}
        <DepartmentHeadControl
          department={department}
          members={department.members}
        />

        {/* Department Members Directory */}
        <Card className="overflow-hidden">
          <div className="p-6 sm:p-8">
            <h2 className="section-title">
              Department members{" "}
              <span className="text-base font-normal text-muted tabular-nums">
                ({department.members.length})
              </span>
            </h2>
            <p className="mt-1 text-sm text-secondary">
              Employees assigned to {department.name}. To transfer employees to another department, use the Employee Management interface.
            </p>
          </div>

          {department.members.length === 0 ? (
            <div className="p-8 text-center text-sm text-secondary border-t border-border">
              No employees are currently assigned to this department.
            </div>
          ) : (
            <DataTable label="Department members">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {department.members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <p className="font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-secondary mt-0.5">
                        {member.employeeId} • {member.email}
                      </p>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {member.role === "ADMIN"
                            ? "Administrator"
                            : member.role === "DEPARTMENT_HEAD"
                            ? "Department Head"
                            : "Employee"}
                        </span>
                        {member.id === department.headId && (
                          <StatusBadge tone="success" subtle>
                            Designated Head
                          </StatusBadge>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge
                        tone={member.accountStatus === "ACTIVE" ? "success" : "neutral"}
                      >
                        {member.accountStatus === "ACTIVE" ? "Active" : "Inactive"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>
    </>
  );
}
