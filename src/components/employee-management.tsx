"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEmployeeAction, resetEmployeeAction } from "@/app/auth-actions";
import type { ActionResult } from "@/lib/action-result";

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
  return <div className="mt-8 space-y-8">
    {result?.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{result.error}</p>}
    {result?.credentials && <section aria-label="Temporary credentials" className="rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="font-semibold text-teal-950">Credentials for {result.credentials.employeeId}</p><p className="mt-2 text-sm text-teal-900">Share privately with the employee. This password is shown only in this response and is not saved for retrieval.</p><p className="mt-4 break-all rounded-lg bg-white p-3 font-mono text-base" aria-label="Temporary password">{result.credentials.temporaryPassword}</p><button type="button" onClick={() => setResult(null)} className="mt-4 text-sm font-semibold text-teal-800">Dismiss credentials</button></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold">Create an employee account</h2><p className="mt-2 text-sm text-slate-500">A temporary password will be generated. The employee must replace it on first login.</p>
      <form ref={formRef} onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="mt-6"><fieldset disabled={pending} className="grid gap-5 disabled:opacity-60 sm:grid-cols-2">
        <div><label htmlFor="new-employeeId" className="mb-2 block text-sm font-medium">Employee ID</label><input id="new-employeeId" name="employeeId" className="field" required minLength={2} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,63}" placeholder="EMP001" /></div>
        <div><label htmlFor="new-name" className="mb-2 block text-sm font-medium">Full name</label><input id="new-name" name="name" className="field" required maxLength={100} autoComplete="off" /></div>
        <div><label htmlFor="new-email" className="mb-2 block text-sm font-medium">Email</label><input id="new-email" name="email" className="field" type="email" required maxLength={254} autoComplete="off" /></div>
        <div><label htmlFor="new-department" className="mb-2 block text-sm font-medium">Department</label><select id="new-department" name="departmentId" className="field" required defaultValue=""><option value="" disabled>Select a department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></div>
        <div><label htmlFor="new-role" className="mb-2 block text-sm font-medium">Role</label><select id="new-role" name="role" className="field" defaultValue="EMPLOYEE"><option value="EMPLOYEE">Employee</option><option value="DEPARTMENT_HEAD">Department Head</option></select><p className="mt-2 text-xs text-slate-500">A Department Head is designated for the selected department.</p></div>
        <div className="flex items-end"><button className="button-primary w-full sm:w-auto" disabled={pending || !departments.length}>{pending ? "Please wait…" : "Create account"}</button></div>
      </fieldset></form>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white"><div className="p-6"><h2 className="text-lg font-semibold">Employee directory</h2><p className="mt-2 text-sm text-slate-500">Credential resets revoke existing sessions and require another password change.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3">Employee</th><th className="px-6 py-3">Department</th><th className="px-6 py-3">Role / status</th><th className="px-6 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-100">{employees.map((employee) => <tr key={employee.id}><td className="px-6 py-4"><p className="font-medium">{employee.name}</p><p className="mt-1 text-xs text-slate-500">{employee.employeeId} · {employee.email}</p></td><td className="px-6 py-4">{employee.department.name}</td><td className="px-6 py-4"><p>{employee.role.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{employee.accountStatus}</p></td><td className="px-6 py-4">{employee.role !== "ADMIN" && <button type="button" disabled={pending} className="whitespace-nowrap text-sm font-semibold text-teal-700 disabled:opacity-50" onClick={() => { if (!window.confirm(`Reset credentials for ${employee.employeeId}? Existing sessions will be revoked.`)) return; const data = new FormData(); data.set("userId", employee.id); submit(data, true); }}>Reset credentials</button>}</td></tr>)}</tbody></table></div></section>
  </div>;
}
