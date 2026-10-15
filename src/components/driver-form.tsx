"use client";

import { useActionState, useRef, useState } from "react";
import { NavigationLink as Link } from "@/components/navigation-link";
import { saveDriverAction } from "@/app/driver-actions";
import { Button, Card, Feedback, FormField, Input } from "@/components/ui";
import type { DriverActionResult, DriverRecord } from "@/lib/driver-types";
import { useSubmissionLock } from "@/components/use-submission-lock";
import { useValidationFocus } from "@/components/use-validation-focus";

export function DriverForm({ driver }: { driver?: DriverRecord }) {
  const [state, action, pending] = useActionState(
    saveDriverAction,
    {} as DriverActionResult,
  );
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  useValidationFocus(form, state.fieldErrors, !pending);

  const [name, setName] = useState(driver?.name ?? "");
  const [driverIdentifier, setDriverIdentifier] = useState(driver?.driverIdentifier ?? "");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const [email, setEmail] = useState(driver?.email ?? "");

  const errors = state.fieldErrors ?? {};

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="section-title">Driver profile</h2>
        <p className="mt-1 text-sm text-secondary">
          {driver
            ? "Update driver contact information and identifier."
            : "Register an organizational transport driver for vehicle assignments."}
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
        {driver && <input type="hidden" name="id" value={driver.id} />}

        <fieldset disabled={pending} className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              id="driver-name"
              label="Full name"
              required
              hint="e.g. Sunil Perera, Kamal Silva"
              error={errors.name}
            >
              <Input
                id="driver-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "driver-name-error" : undefined}
                autoComplete="name"
              />
            </FormField>

            <FormField
              id="driver-identifier"
              label="Driver identifier"
              required
              hint="Unique organizational identifier (e.g. DRV-001, D-101)"
              error={errors.driverIdentifier}
            >
              <Input
                id="driver-identifier"
                name="driverIdentifier"
                value={driverIdentifier}
                onChange={(e) => setDriverIdentifier(e.target.value.toUpperCase())}
                required
                maxLength={20}
                className="font-mono uppercase"
                aria-invalid={Boolean(errors.driverIdentifier)}
                aria-describedby={errors.driverIdentifier ? "driver-identifier-error" : undefined}
              />
            </FormField>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              id="driver-phone"
              label="Contact phone"
              required
              hint="e.g. +94 77 123 4567, 071-2345678"
              error={errors.phone}
            >
              <Input
                id="driver-phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={25}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "driver-phone-error" : undefined}
                autoComplete="tel"
              />
            </FormField>

            <FormField
              id="driver-email"
              label="Email address"
              hint="Optional organizational or notification email"
              error={errors.email}
            >
              <Input
                id="driver-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={150}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "driver-email-error" : undefined}
                autoComplete="email"
              />
            </FormField>
          </div>
        </fieldset>

        {state.error && <Feedback tone="danger">{state.error}</Feedback>}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
          <Link href="/admin/drivers" className="button button-neutral">
            Cancel
          </Link>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : driver
                ? "Save driver changes"
                : "Register driver"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
