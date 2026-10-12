"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEmployeeAction, resetEmployeeAction } from "@/app/auth-actions";
import type { ActionResult } from "@/lib/action-result";
import { Button, Card, DataTable, EmptyState, FormField, Input, StatusBadge } from "@/components/ui";

type Employee = { id: string; employeeId: string; name: string; email: string; role: string; accountStatus: string; department: { name: string } };
export function EmployeeManagement({ departments, employees }: { departments: { id: string; name: string }[]; employees: Employee[] }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  function submit(data: FormData, reset = false) {
    setResult(null); // Never send a previous temporary password back to the server.
    startTransition(async () => {
      try {
        const response = await (reset ? resetEmployeeAction(data) : createEmployeeAction(data));
        setResult(response);
        if (response.credentials) { if (!reset) formRef.current?.reset(); router.refresh(); }
      } catch { setResult({ error: "The operation could not be completed. Please try again." }); }
    });
  }
  return (
    <div className="space-y-8" aria-busy={pending}>
      {result?.error && <p role="alert" className="feedback feedback-danger">{result.error}</p>}
      {result?.credentials && (
        <section aria-label="Temporary credentials" className="feedback feedback-success">
          <p role="status" className="font-semibold">Credentials created for {result.credentials.employeeId}.</p>
          <p className="mt-2">Share privately with the employee. This password is shown only in this response and is not saved for retrieval.</p>
          <p className="mt-4 break-all border border-border bg-surface p-4 font-mono text-base text-foreground" aria-label="Temporary password">{result.credentials.temporaryPassword}</p>
          <Button type="button" variant="secondary" onClick={() => setResult(null)} className="mt-4">Dismiss credentials</Button>
        </section>
      )}
      <Card className="p-6 sm:p-8">
        <h2 className="section-title">Create an employee account</h2>
        <p className="mt-2 text-secondary">A temporary password will be generated. The employee must replace it on first login.</p>
        {!departments.length && <p className="feedback feedback-warning mt-4">No departments are available. A department must exist before an employee account can be created.</p>}
        <form ref={formRef} onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="mt-6">
          <fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">
            <FormField id="new-employeeId" label="Employee ID">
              <Input id="new-employeeId" name="employeeId" required minLength={2} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,63}" placeholder="EMP001" />
            </FormField>
            <FormField id="new-name" label="Full name">
              <Input id="new-name" name="name" required maxLength={100} autoComplete="off" />
            </FormField>
            <FormField id="new-email" label="Email">
              <Input id="new-email" name="email" type="email" required maxLength={254} autoComplete="off" />
            </FormField>
            <FormField id="new-department" label="Department">
              <select id="new-department" name="departmentId" className="field" required defaultValue="">
                <option value="" disabled>Select a department</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </FormField>
            <FormField id="new-role" label="Role" hint="A Department Head is designated for the selected department.">
              <select id="new-role" name="role" className="field" defaultValue="EMPLOYEE" aria-describedby="new-role-hint">
                <option value="EMPLOYEE">Employee</option><option value="DEPARTMENT_HEAD">Department Head</option>
              </select>
            </FormField>
            <div className="flex items-end sm:col-span-2 sm:justify-end">
              <Button type="submit" className="w-full sm:w-auto" disabled={pending || !departments.length}>{pending ? "Please wait…" : "Create account"}</Button>
            </div>
          </fieldset>
        </form>
      </Card>
      <Card>
        <div className="p-6 sm:p-8">
          <h2 className="section-title">Employee directory <span className="text-base text-muted tabular-nums">({employees.length})</span></h2>
          <p className="mt-2 text-secondary">Credential resets revoke existing sessions and require another password change.</p>
        </div>
        {!employees.length ? <EmptyState title="No employees found" description="Create an employee account using the form above. New accounts will appear in this directory." /> : (
          <DataTable label="Employee directory">
            <thead><tr><th scope="col">Employee</th><th scope="col">Department</th><th scope="col">Role and status</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td><p className="font-medium">{employee.name}</p><p className="supporting-text mt-2">{employee.employeeId}</p><p className="supporting-text">{employee.email}</p></td>
                  <td>{employee.department.name}</td>
                  <td><p>{employee.role === "ADMIN" ? "Administrator" : employee.role === "DEPARTMENT_HEAD" ? "Department Head" : "Employee"}</p><div className="mt-2"><StatusBadge tone={employee.accountStatus === "ACTIVE" ? "success" : "neutral"}>{employee.accountStatus === "ACTIVE" ? "Active" : "Inactive"}</StatusBadge></div></td>
                  <td>{employee.role !== "ADMIN" && <Button type="button" variant="secondary" disabled={pending} className="whitespace-nowrap" aria-label={`Reset credentials for ${employee.employeeId}`} onClick={() => { if (!window.confirm(`Reset credentials for ${employee.employeeId}? Existing sessions will be revoked.`)) return; const data = new FormData(); data.set("userId", employee.id); submit(data, true); }}>Reset credentials</Button>}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
      <p role="status" aria-live="polite" className="sr-only">{pending ? "Processing employee account request" : ""}</p>
    </div>
  );
}
