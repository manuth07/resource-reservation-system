"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { saveResourceAction } from "@/app/resource-actions";
import { Button, Card, FormField, Input } from "@/components/ui";
import type { ResourceActionResult, ResourceCategoryOption, ResourceRecord } from "@/lib/resource-types";

export function ResourceForm({ categories, resource, policyLocked = false }: { categories: ResourceCategoryOption[]; resource?: ResourceRecord; policyLocked?: boolean }) {
  const [state, action, pending] = useActionState(saveResourceAction, {} as ResourceActionResult);
  const [categoryId, setCategoryId] = useState(resource?.categoryId ?? "");
  const [approval, setApproval] = useState(resource?.requiresApproval ?? false);
  const vehicle = categories.find((category) => category.id === categoryId)?.isVehicle ?? false;
  const approvalValue = policyLocked ? !!resource?.requiresApproval : vehicle || approval;
  return (
    <Card className="max-w-3xl p-6 sm:p-8">
      {policyLocked && <p className="feedback feedback-info mb-6">Reservation history protects this resource&apos;s category and approval policy. Operational details and status can still be edited.</p>}
      <form action={action} aria-busy={pending} className="space-y-6" onSubmit={(event) => {
        if (resource?.isActive && !new FormData(event.currentTarget).has("isActive") && !window.confirm(`Deactivate ${resource.name}? Existing reservation history will be preserved.`)) event.preventDefault();
      }}>
        {resource && <><input type="hidden" name="id" value={resource.id} /><input type="hidden" name="updatedAt" value={resource.updatedAt} /></>}
        <fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">
          <FormField id="resource-name" label="Resource name"><Input id="resource-name" name="name" defaultValue={resource?.name} required maxLength={120} /></FormField>
          <FormField id="resource-code" label="Resource code" hint="2–64 letters, numbers, hyphens or underscores."><Input id="resource-code" name="resourceCode" defaultValue={resource?.resourceCode} required minLength={2} maxLength={64} pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{1,63}"} aria-describedby="resource-code-hint" /></FormField>
          <FormField id="resource-category" label="Category">
            <select id="resource-category" name="categoryId" className="field" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={policyLocked}>
              <option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isVehicle ? " (vehicle)" : ""}</option>)}
            </select>{policyLocked && <input type="hidden" name="categoryId" value={categoryId} />}
          </FormField>
          <FormField id="resource-capacity" label="Capacity" hint="Optional positive whole number."><Input id="resource-capacity" name="capacity" type="number" min={1} max={2147483647} step={1} defaultValue={resource?.capacity ?? ""} aria-describedby="resource-capacity-hint" className="tabular-nums" /></FormField>
          <div className="sm:col-span-2"><FormField id="resource-location" label="Location"><Input id="resource-location" name="location" defaultValue={resource?.location ?? ""} maxLength={200} /></FormField></div>
          <div className="sm:col-span-2 space-y-4">
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isActive" value="true" defaultChecked={resource?.isActive ?? true} className="size-4 accent-primary" />Operationally active</label>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="requiresApproval" value="true" checked={approvalValue} onChange={(event) => setApproval(event.target.checked)} disabled={policyLocked || vehicle} aria-describedby="approval-help" className="size-4 accent-primary" />Requires approval</label>
            {(policyLocked || vehicle) && <input type="hidden" name="requiresApproval" value={String(approvalValue)} />}
            <p id="approval-help" className="supporting-text">{vehicle ? "Vehicles require approval and administrator assignment. Vehicle and driver allocation will be implemented later." : "Approval-based requests require review. Resources without approval use direct booking when reservation functionality is implemented."}</p>
            <p className="supporting-text">Active indicates operational status, not availability for a particular date or time.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-4 sm:col-span-2"><Link href="/admin/resources" className="button button-secondary">Cancel</Link><Button type="submit" disabled={pending}>{pending ? "Saving…" : resource ? "Save resource" : "Create resource"}</Button></div>
        </fieldset>
        {state.error && <p role="alert" className="feedback feedback-danger">{state.error}</p>}
        <p role="status" className="sr-only">{pending ? "Saving resource" : ""}</p>
      </form>
    </Card>
  );
}
