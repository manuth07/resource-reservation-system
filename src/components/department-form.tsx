"use client";

import { useActionState, useRef, useState } from "react";
import { NavigationLink as Link } from "@/components/navigation-link";
import { saveDepartmentAction } from "@/app/department-actions";
import { Button, Card, Feedback, FormField, Input } from "@/components/ui";
import type { DepartmentActionResult, DepartmentRecord } from "@/lib/department-types";
import { useSubmissionLock } from "@/components/use-submission-lock";
import { useValidationFocus } from "@/components/use-validation-focus";

export function DepartmentForm({ department }: { department?: DepartmentRecord }) {
  const [state, action, pending] = useActionState(
    saveDepartmentAction,
    {} as DepartmentActionResult,
  );
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  useValidationFocus(form, state.fieldErrors, !pending);

  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [description, setDescription] = useState(department?.description ?? "");

  const errors = state.fieldErrors ?? {};

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="section-title">Department details</h2>
        <p className="mt-1 text-sm text-secondary">
          Define the organizational department name, unique code, and description.
        </p>
      </div>

      <form
        ref={form}
        action={action}
        aria-busy={pending}
        className="space-y-6"
        onSubmit={(event) => {
          if (!submission.acquire()) event.preventDefault();
        }}
      >
        {department && <input type="hidden" name="id" value={department.id} />}

        <fieldset disabled={pending} className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              id="department-name"
              label="Department name"
              required
              hint="e.g. Information Technology, Human Resources"
              error={errors.name}
            >
              <Input
                id="department-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Finance"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? "department-name-error" : "department-name-hint"}
              />
            </FormField>

            <FormField
              id="department-code"
              label="Department code"
              required
              hint="2–20 letters, numbers, hyphens or underscores (auto-capitalized)."
              error={errors.code}
            >
              <Input
                id="department-code"
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                minLength={2}
                maxLength={20}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,19}"
                placeholder="e.g. FIN"
                className="uppercase"
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? "department-code-error" : "department-code-hint"}
              />
            </FormField>
          </div>

          <FormField
            id="department-description"
            label="Description (optional)"
            hint="Brief description of the department's institutional role."
            error={errors.description}
          >
            <textarea
              id="department-description"
              name="description"
              className="field"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Manages organizational accounting, budgeting, and financial reporting."
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "department-description-error" : "department-description-hint"}
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Link href="/admin/departments" className="button button-secondary">
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : department
                ? "Save changes"
                : "Create department"}
            </Button>
          </div>
        </fieldset>

        {state.error && !Object.keys(errors).length && (
          <Feedback tone="danger">{state.error}</Feedback>
        )}
      </form>
    </Card>
  );
}
