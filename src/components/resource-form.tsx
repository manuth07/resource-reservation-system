"use client";
import { NavigationLink as Link } from "@/components/navigation-link";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveResourceAction } from "@/app/resource-actions";
import { Button, Card, Feedback, FormField, Input, Select } from "@/components/ui";
import { ConfirmationDialog, resourceDeactivationDescription } from "@/components/confirmation-dialog";
import type { ResourceActionResult, ResourceCategoryOption, ResourceRecord } from "@/lib/resource-types";
import { useSubmissionLock } from "@/components/use-submission-lock";
import { useValidationFocus } from "@/components/use-validation-focus";

export function ResourceForm({ categories, resource, policyLocked = false }: { categories: ResourceCategoryOption[]; resource?: ResourceRecord; policyLocked?: boolean }) {
  const [state, action, pending] = useActionState(saveResourceAction, {} as ResourceActionResult);
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const wasPending = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useValidationFocus(form, state.fieldErrors, !pending && !confirmOpen);
  const [name, setName] = useState(resource?.name ?? "");
  const [code, setCode] = useState(resource?.resourceCode ?? "");
  const [capacity, setCapacity] = useState(String(resource?.capacity ?? ""));
  const [location, setLocation] = useState(resource?.location ?? "");
  const [active, setActive] = useState(resource?.isActive ?? true);
  const [categoryId, setCategoryId] = useState(resource?.categoryId ?? "");
  const [approval, setApproval] = useState(resource?.requiresApproval ?? false);
  const vehicle = categories.find((category) => category.id === categoryId)?.isVehicle ?? false;
  const approvalValue = policyLocked ? !!resource?.requiresApproval : vehicle || approval;
  const errors = state.fieldErrors ?? {};
  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      wasPending.current = false;
      confirmed.current = false;
      setConfirmOpen(false);
    }
  }, [pending]);
  return <Card className="max-w-3xl p-6 sm:p-8">
    {policyLocked && <p className="feedback feedback-info mb-6">Reservation history protects this resource&apos;s category and approval policy. Operational details and status can still be edited.</p>}
    <form ref={form} action={action} aria-busy={pending} className="space-y-6" onSubmit={(event) => {
      if (!submission.acquire()) { event.preventDefault(); return; }
      if (resource?.isActive && !active && !confirmed.current) {
        event.preventDefault(); submission.release(); setConfirmOpen(true); return;
      }
      confirmed.current = false;
    }}>
      {resource && <><input type="hidden" name="id" value={resource.id} /><input type="hidden" name="updatedAt" value={resource.updatedAt} /></>}
      <fieldset disabled={pending} className="grid gap-6 sm:grid-cols-2">
        <FormField id="resource-name" label="Resource name" required error={errors.name}><Input id="resource-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} aria-invalid={!!errors.name} aria-describedby={errors.name ? "resource-name-error" : undefined} /></FormField>
        <FormField id="resource-code" label="Resource code" required hint="2–64 letters, numbers, hyphens or underscores." error={errors.resourceCode}><Input id="resource-code" name="resourceCode" value={code} onChange={(event) => setCode(event.target.value)} required minLength={2} maxLength={64} pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{1,63}"} aria-invalid={!!errors.resourceCode} aria-describedby={`resource-code-hint${errors.resourceCode ? " resource-code-error" : ""}`} /></FormField>
        <FormField id="resource-category" label="Category" required error={errors.categoryId}>
          <Select id="resource-category" name="categoryId" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={policyLocked} aria-invalid={!!errors.categoryId} aria-describedby={errors.categoryId ? "resource-category-error" : undefined}>
            <option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isVehicle ? " (vehicle)" : ""}</option>)}
          </Select>{policyLocked && <input type="hidden" name="categoryId" value={categoryId} />}
        </FormField>
        <FormField id="resource-capacity" label="Capacity (optional)" hint="Positive whole number, or leave empty." error={errors.capacity}><Input id="resource-capacity" name="capacity" type="number" min={1} max={2147483647} step={1} value={capacity} onChange={(event) => setCapacity(event.target.value)} aria-invalid={!!errors.capacity} aria-describedby={`resource-capacity-hint${errors.capacity ? " resource-capacity-error" : ""}`} className="tabular-nums" /></FormField>
        {vehicle ? <input type="hidden" name="location" value={location} /> : <div className="sm:col-span-2"><FormField id="resource-location" label="Location (optional)" hint="For example: 2nd Floor, Building A or IT Equipment Store." error={errors.location}><Input id="resource-location" name="location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={200} aria-invalid={!!errors.location} aria-describedby={`resource-location-hint${errors.location ? " resource-location-error" : ""}`} /></FormField></div>}
        <div className="sm:col-span-2 space-y-4">
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isActive" value="true" checked={active} onChange={(event) => setActive(event.target.checked)} className="size-4 accent-primary" />Operationally active</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="requiresApproval" value="true" checked={approvalValue} onChange={(event) => setApproval(event.target.checked)} disabled={policyLocked || vehicle} aria-describedby="approval-help" className="size-4 accent-primary" />Requires approval</label>
          {(policyLocked || vehicle) && <input type="hidden" name="requiresApproval" value={String(approvalValue)} />}
          <p id="approval-help" className="supporting-text">{vehicle ? "Vehicles require approval and administrator assignment. Vehicle and driver allocation will be implemented later." : "Standard resources may require Department Head approval. Resources without approval use direct booking when reservation functionality is implemented."}</p>
          <p className="supporting-text">Active indicates operational status, not availability for a particular date or time.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-4 sm:col-span-2"><Link href="/admin/resources" className="button button-secondary">Cancel</Link><Button type="submit" disabled={pending}>{pending ? "Saving…" : resource ? "Save resource" : "Create resource"}</Button></div>
      </fieldset>
      {state.error && (!Object.keys(errors).length || (vehicle && errors.location)) && <Feedback tone="danger">{state.error}</Feedback>}
      <p role="status" className="sr-only">{pending ? "Saving resource" : ""}</p>
    </form>
    <ConfirmationDialog open={confirmOpen} title={`Deactivate ${resource?.name ?? "resource"}?`} description={`${resourceDeactivationDescription} Other form changes will also be saved.`} confirmLabel="Deactivate and save" pending={pending} onCancel={() => { confirmed.current = false; setConfirmOpen(false); }} onConfirm={() => { confirmed.current = true; form.current?.requestSubmit(); }} />
  </Card>;
}
