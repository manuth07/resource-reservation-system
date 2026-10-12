"use client";
import { useId, useState } from "react";
import { FormField, Input } from "@/components/ui";

export function PasswordField({ name, label, autoComplete, minLength, hint }: { name: string; label: string; autoComplete: string; minLength?: number; hint?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <FormField id={id} label={label} hint={hint}>
      <div className="relative">
        <Input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength} maxLength={name === "currentPassword" || name === "password" ? 1024 : 128} aria-describedby={hint ? `${id}-hint` : undefined} className="pr-20" />
        <button type="button" onClick={() => setVisible(!visible)} aria-controls={id} aria-pressed={visible} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-primary hover:text-primary-hover">{visible ? "Hide" : "Show"}</button>
      </div>
    </FormField>
  );
}
