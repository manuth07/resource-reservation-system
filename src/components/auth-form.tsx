"use client";
import { useActionState } from "react";
import { loginAction, changePasswordAction } from "@/app/auth-actions";
import { PasswordField } from "@/components/password-field";
import type { ActionResult } from "@/lib/action-result";
export function AuthForm({ mode }: { mode: "login" | "password" }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : changePasswordAction, {} as ActionResult);
  return <form action={action} className="space-y-6"><fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
    {mode === "login" ? <><div className="space-y-2"><label htmlFor="employeeId" className="block text-sm font-medium text-slate-700">Employee ID</label><input className="field" id="employeeId" name="employeeId" autoComplete="username" autoCapitalize="characters" required maxLength={128} placeholder="e.g. EMP001" /></div><PasswordField name="password" label="Password" autoComplete="current-password" /></> : <><PasswordField name="currentPassword" label="Current password" autoComplete="current-password" /><PasswordField name="newPassword" label="New password" autoComplete="new-password" minLength={12} /><p className="text-xs leading-5 text-slate-500">Use 12–128 characters, including a letter and a number. Choose a password you haven’t used for this account.</p><PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" minLength={12} /></>}
    <button className="button-primary w-full" type="submit">{pending ? "Please wait…" : mode === "login" ? "Sign in" : "Change password & sign out"}</button></fieldset>
    {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}<p role="status" aria-live="polite" className="sr-only">{pending ? "Submitting your request" : ""}</p></form>;
}
