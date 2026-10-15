"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEmployeeAction, resetEmployeeAction } from "@/app/auth-actions";
import { transferEmployeeAction } from "@/app/department-actions";
import type { ActionResult } from "@/lib/action-result";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Feedback,
  FormField,
  Input,
  StatusBadge,
} from "@/components/ui";
import { useSubmissionLock } from "@/components/use-submission-lock";

type DepartmentOption = { id: string; name: string; code?: string; headId?: string | null };
type Employee = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
  departmentId: string;
  department: { id?: string; name: string; headId?: string | null };
};

function EmployeeTransferDialog({
  employee,
  departments,
  open,
  onClose,
  onSuccess,
}: {
  employee: Employee;
  departments: DepartmentOption[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [targetDepartmentId, setTargetDepartmentId] = useState(employee.departmentId);
  const [role, setRole] = useState(employee.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = dialog.current;
    if (!el || !open) return;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, [open]);

  const isCurrentHead =
    employee.department.headId === employee.id ||
    departments.find((d) => d.id === employee.departmentId)?.headId === employee.id;

  const willVacateHead =
    isCurrentHead &&
    (targetDepartmentId !== employee.departmentId || role !== "DEPARTMENT_HEAD");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const fd = new FormData();
      fd.set("userId", employee.id);
      fd.set("targetDepartmentId", targetDepartmentId);
      fd.set("role", role);

      const res = await transferEmployeeAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        onSuccess();
        onClose();
      }
    });
  };

  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog"
      aria-labelledby={`${id}-title`}
      aria-busy={pending}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <h2 id={`${id}-title`} className="section-title">
          Transfer employee
        </h2>
        <p className="mt-2 text-sm text-secondary">
          Update department assignment and role for <strong>{employee.name}</strong> ({employee.employeeId}).
        </p>

        {error && <Feedback tone="danger" className="mt-4">{error}</Feedback>}

        {willVacateHead && (
          <Feedback tone="warning" className="mt-4">
            <strong>Head of Department alert:</strong> {employee.name} is currently the designated Head of {employee.department.name}. Changing their department or demoting them will automatically vacate their Department Head designation.
          </Feedback>
        )}

        <div className="mt-4 space-y-4">
          <FormField id={`${id}-target-dept`} label="Target department" required>
            <select
              id={`${id}-target-dept`}
              className="field w-full"
              value={targetDepartmentId}
              onChange={(e) => setTargetDepartmentId(e.target.value)}
              disabled={pending}
              required
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.id === employee.departmentId ? "(Current)" : ""}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id={`${id}-role`} label="Role assignment" required>
            <select
              id={`${id}-role`}
              className="field w-full"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={pending}
              required
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="DEPARTMENT_HEAD">Department Head</option>
            </select>
          </FormField>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save assignment"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function EmployeeManagement({
  departments,
  employees,
}: {
  departments: DepartmentOption[];
  employees: Employee[];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const submission = useSubmissionLock(pending);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [transferEmployeeTarget, setTransferEmployeeTarget] = useState<Employee | null>(null);

  function submit(data: FormData, reset = false) {
    if (!submission.acquire()) return;
    setResult(null);
    startTransition(async () => {
      try {
        const response = await (reset ? resetEmployeeAction(data) : createEmployeeAction(data));
        setResult(response);
        if (response.credentials) {
          if (!reset) formRef.current?.reset();
          router.refresh();
        }
      } catch {
        setResult({ error: "The operation could not be completed. Please try again." });
      }
    });
  }

  return (
    <div className="space-y-8" aria-busy={pending}>
      {result?.error && <p role="alert" className="feedback feedback-danger">{result.error}</p>}
      {result?.credentials && (
        <section aria-label="Temporary credentials" className="feedback feedback-success">
          <p role="status" className="font-semibold">
            Credentials created for {result.credentials.employeeId}.
          </p>
          <p className="mt-2">
            Share privately with the employee. This password is shown only in this response and is not saved for retrieval.
          </p>
          <p
            className="mt-4 break-all border border-border bg-surface p-4 font-mono text-base text-foreground"
            aria-label="Temporary password"
          >
            {result.credentials.temporaryPassword}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setResult(null)}
            className="mt-4"
          >
            Dismiss credentials
          </Button>
        </section>
      )}

      {/* Employee Provisioning Card */}
      <Card className="p-6 sm:p-8">
        <h2 className="section-title">Create an employee account</h2>
        <p className="mt-2 text-secondary">
          A temporary password will be generated. The employee must replace it on first login.
        </p>
        {!departments.length && (
          <p className="feedback feedback-warning mt-4">
            No departments are available. A department must exist before an employee account can be created.
          </p>
        )}
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
          className="mt-6"
        >
          <fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">
            <FormField id="new-employeeId" label="Employee ID">
              <Input
                id="new-employeeId"
                name="employeeId"
                required
                minLength={2}
                maxLength={64}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,63}"
                placeholder="EMP001"
              />
            </FormField>
            <FormField id="new-name" label="Full name">
              <Input id="new-name" name="name" required maxLength={100} autoComplete="off" />
            </FormField>
            <FormField id="new-email" label="Email">
              <Input
                id="new-email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="off"
              />
            </FormField>
            <FormField id="new-department" label="Department">
              <select
                id="new-department"
                name="departmentId"
                className="field"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select a department
                </option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              id="new-role"
              label="Role"
              hint="Designating a Department Head enables department-level reservation decisions."
            >
              <select
                id="new-role"
                name="role"
                className="field"
                defaultValue="EMPLOYEE"
                aria-describedby="new-role-hint"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="DEPARTMENT_HEAD">Department Head</option>
              </select>
            </FormField>
            <div className="flex items-end sm:col-span-2 sm:justify-end">
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={pending || !departments.length}
              >
                {pending ? "Please wait…" : "Create account"}
              </Button>
            </div>
          </fieldset>
        </form>
      </Card>

      {/* Employee Directory Card */}
      <Card>
        <div className="p-6 sm:p-8">
          <h2 className="section-title">
            Employee directory{" "}
            <span className="text-base text-muted tabular-nums">
              ({employees.length})
            </span>
          </h2>
          <p className="mt-2 text-secondary">
            Manage employee departmental assignments, roles, and credential resets.
          </p>
        </div>
        {!employees.length ? (
          <EmptyState
            title="No employees found"
            description="Create an employee account using the form above. New accounts will appear in this directory."
          />
        ) : (
          <DataTable label="Employee directory">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Department</th>
                <th scope="col">Role and status</th>
                <th scope="col" className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => {
                const isHod =
                  employee.department.headId === employee.id ||
                  departments.find((d) => d.id === employee.departmentId)?.headId ===
                    employee.id;

                return (
                  <tr key={employee.id}>
                    <td>
                      <p className="font-medium text-foreground">{employee.name}</p>
                      <p className="supporting-text mt-1">{employee.employeeId}</p>
                      <p className="supporting-text">{employee.email}</p>
                    </td>
                    <td>
                      <p className="font-medium text-foreground">
                        {employee.department.name}
                      </p>
                      {isHod && (
                        <div className="mt-1">
                          <StatusBadge tone="success" subtle>
                            Designated Head
                          </StatusBadge>
                        </div>
                      )}
                    </td>
                    <td>
                      <p className="text-sm">
                        {employee.role === "ADMIN"
                          ? "Administrator"
                          : employee.role === "DEPARTMENT_HEAD"
                          ? "Department Head"
                          : "Employee"}
                      </p>
                      <div className="mt-1">
                        <StatusBadge
                          tone={
                            employee.accountStatus === "ACTIVE"
                              ? "success"
                              : "neutral"
                          }
                        >
                          {employee.accountStatus === "ACTIVE" ? "Active" : "Inactive"}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="text-right">
                      {employee.role !== "ADMIN" && (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            onClick={() => setTransferEmployeeTarget(employee)}
                          >
                            Transfer
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            aria-label={`Reset credentials for ${employee.employeeId}`}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Reset credentials for ${employee.employeeId}? Existing sessions will be revoked.`,
                                )
                              )
                                return;
                              const data = new FormData();
                              data.set("userId", employee.id);
                              submit(data, true);
                            }}
                          >
                            Reset credentials
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>

      {transferEmployeeTarget && (
        <EmployeeTransferDialog
          key={transferEmployeeTarget.id}
          employee={transferEmployeeTarget}
          departments={departments}
          open={!!transferEmployeeTarget}
          onClose={() => setTransferEmployeeTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Processing employee account request" : ""}
      </p>
    </div>
  );
}
