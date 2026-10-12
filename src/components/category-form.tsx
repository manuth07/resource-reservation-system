"use client";
import { NavigationLink as Link } from "@/components/navigation-link";
import { useActionState, useRef, useState } from "react";
import { saveCategoryAction } from "@/app/resource-actions";
import { Button, Card, Feedback, FormField, Input } from "@/components/ui";
import type { CategoryRecord, ResourceActionResult } from "@/lib/resource-types";
import { useSubmissionLock } from "@/components/use-submission-lock";
import { useValidationFocus } from "@/components/use-validation-focus";

export function CategoryForm({ category }: { category?: CategoryRecord }) {
  const [state, action, pending] = useActionState(saveCategoryAction, {} as ResourceActionResult);
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  useValidationFocus(form, state.fieldErrors, !pending);
  const [name, setName] = useState(category?.name ?? "");
  const [code, setCode] = useState(category?.code ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [vehicle, setVehicle] = useState(category?.isVehicle ?? false);
  const errors = state.fieldErrors ?? {};
  const locked = !!category && (category.resourceCount > 0 || category.reservationCount > 0);
  return <Card className="max-w-3xl p-6 sm:p-8">
    {locked && <p className="feedback feedback-info mb-6">This category is referenced. Its code and classification are protected; its name and description may be edited.</p>}
    <form ref={form} action={action} aria-busy={pending} className="space-y-6" onSubmit={(event) => { if (!submission.acquire()) event.preventDefault(); }}>
      {category && <><input type="hidden" name="id" value={category.id} /><input type="hidden" name="updatedAt" value={category.updatedAt} /></>}
      <fieldset disabled={pending} className="space-y-6">
        <FormField id="category-name" label="Category name" required error={errors.name}><Input id="category-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} aria-invalid={!!errors.name} aria-describedby={errors.name ? "category-name-error" : undefined} /></FormField>
        <FormField id="category-code" label="Category code" required hint="2–64 letters, numbers, hyphens or underscores." error={errors.code}><Input id="category-code" name="code" value={code} onChange={(event) => setCode(event.target.value)} readOnly={locked} required minLength={2} maxLength={64} pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{1,63}"} aria-invalid={!!errors.code} aria-describedby={`category-code-hint${errors.code ? " category-code-error" : ""}`} /></FormField>
        <FormField id="category-description" label="Description (optional)" error={errors.description}><textarea id="category-description" name="description" className="field" rows={4} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={!!errors.description} aria-describedby={errors.description ? "category-description-error" : undefined} /></FormField>
        <fieldset disabled={locked} aria-describedby="classification-help" className="space-y-4">
          <legend className="form-label mb-2">Resource classification <span className="supporting-text">(required)</span></legend>
          <p id="classification-help" className="text-sm text-secondary">Classification determines the booking flow. Approval is configured separately per resource; standard resources may also require Department Head approval.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[{ value: false, title: "Standard Resource", description: "Rooms, projectors, training facilities and equipment. Employees select a specific available resource when booking." }, { value: true, title: "Vehicle / Transport", description: "Cars, vans and organizational transport. Employees request a category, such as VAN; an Admin assigns a vehicle and driver after approval." }].map((option) => <label key={String(option.value)} className={`flex items-start gap-4 border p-4 ${vehicle === option.value ? "border-primary bg-navigation-selected" : "border-control-border bg-surface"}`}>
              <input type="radio" name="isVehicle" value={String(option.value)} checked={vehicle === option.value} onChange={() => setVehicle(option.value)} required className="mt-1 size-4 shrink-0 accent-primary" />
              <span><span className="block font-medium">{option.title}</span><span className="mt-2 block text-sm text-secondary">{option.description}</span></span>
            </label>)}
          </div>
        </fieldset>
        {locked && <input type="hidden" name="isVehicle" value={String(vehicle)} />}
        <div className="flex flex-wrap justify-end gap-4"><Link href="/admin/resource-categories" className="button button-secondary">Cancel</Link><Button type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Save category" : "Create category"}</Button></div>
      </fieldset>
      {state.error && !Object.keys(errors).length && <Feedback tone="danger">{state.error}</Feedback>}
      <p role="status" className="sr-only">{pending ? "Saving category" : ""}</p>
    </form>
  </Card>;
}
