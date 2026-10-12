"use client";
import { useId, useState } from "react";
export function PasswordField({ name, label, autoComplete, minLength }: { name: string; label: string; autoComplete: string; minLength?: number }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2"><label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label><div className="relative"><input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required minLength={minLength} maxLength={name === "currentPassword" || name === "password" ? 1024 : 128} className="field pr-20" /><button type="button" onClick={() => setVisible(!visible)} aria-controls={id} aria-pressed={visible} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-teal-700 hover:text-teal-900">{visible ? "Hide" : "Show"}</button></div></div>;
}
