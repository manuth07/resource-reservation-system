"use client";
import { useActionState } from "react";
import { loginAction, changePasswordAction } from "@/app/auth-actions";
import { PasswordField } from "@/components/password-field";
import { Button, FormField, Input } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

export function AuthForm({ mode }: { mode: "login" | "password" }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : changePasswordAction, {} as ActionResult);
  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4">
        {mode === "login" ? (
          <>
            <FormField id="employeeId" label="Employee ID">
              <Input id="employeeId" name="employeeId" autoComplete="username" autoCapitalize="characters" required maxLength={128} placeholder="e.g. EMP001" />
            </FormField>
            <PasswordField name="password" label="Password" autoComplete="current-password" />
          </>
        ) : (
          <>
            <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
            <PasswordField name="newPassword" label="New password" autoComplete="new-password" minLength={12} hint="Use 12–128 characters, including a letter and a number. Choose a password you haven't used for this account." />
            <PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" minLength={12} />
          </>
        )}
        <Button className="w-full" type="submit" disabled={pending}>{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Change password and sign out"}</Button>
      </fieldset>
      {state.error && <p role="alert" className="feedback feedback-danger">{state.error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{pending ? "Submitting your request" : ""}</p>
    </form>
  );
}
