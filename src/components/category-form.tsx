"use client";
import Link from "next/link";
import { useActionState } from "react";
import { saveCategoryAction } from "@/app/resource-actions";
import { Button, Card, FormField, Input } from "@/components/ui";
import type { CategoryRecord, ResourceActionResult } from "@/lib/resource-types";

export function CategoryForm({ category }: { category?: CategoryRecord }) {
  const [state, action, pending] = useActionState(saveCategoryAction, {} as ResourceActionResult);
  const locked = !!category && (category.resourceCount > 0 || category.reservationCount > 0);
  return (
    <Card className="max-w-3xl p-6 sm:p-8">
      {locked && <p className="feedback feedback-info mb-6">This category is referenced. Its code and vehicle classification are protected; its name and description may be edited.</p>}
      <form action={action} aria-busy={pending} className="space-y-6">
        {category && <><input type="hidden" name="id" value={category.id} /><input type="hidden" name="updatedAt" value={category.updatedAt} /></>}
        <fieldset disabled={pending} className="space-y-6">
          <FormField id="category-name" label="Category name"><Input id="category-name" name="name" defaultValue={category?.name} required maxLength={100} /></FormField>
          <FormField id="category-code" label="Category code" hint="2–64 letters, numbers, hyphens or underscores."><Input id="category-code" name="code" defaultValue={category?.code} readOnly={locked} required minLength={2} maxLength={64} pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{1,63}"} aria-describedby="category-code-hint" /></FormField>
          <FormField id="category-description" label="Description"><textarea id="category-description" name="description" className="field" rows={4} maxLength={2000} defaultValue={category?.description ?? ""} /></FormField>
          <div><label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isVehicle" value="true" defaultChecked={category?.isVehicle} disabled={locked} aria-describedby="vehicle-help" className="size-4 accent-primary" />Vehicle category</label>{locked && <input type="hidden" name="isVehicle" value={String(category?.isVehicle)} />}<p id="vehicle-help" className="supporting-text">Use for cars, vans and other transport. Employees will request the category; an administrator will allocate a vehicle and driver later.</p></div>
          <div className="flex flex-wrap justify-end gap-4"><Link href="/admin/resource-categories" className="button button-secondary">Cancel</Link><Button type="submit" disabled={pending}>{pending ? "Saving…" : category ? "Save category" : "Create category"}</Button></div>
        </fieldset>
        {state.error && <p role="alert" className="feedback feedback-danger">{state.error}</p>}
        <p role="status" className="sr-only">{pending ? "Saving category" : ""}</p>
      </form>
    </Card>
  );
}
