"use client";

import { useEffect, useId, useRef } from "react";
import { Button, Feedback } from "@/components/ui";

export function ConfirmationDialog({ open, title, description, confirmLabel, pending = false, error, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; confirmLabel: string;
  pending?: boolean; error?: string; onCancel: () => void; onConfirm: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal(); // Native modal focus containment and background inertness.
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  return <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={pending} onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
    <h2 id={`${id}-title`} className="section-title">{title}</h2>
    <p id={`${id}-description`} className="mt-4 text-secondary">{description}</p>
    {error && <Feedback tone="danger" className="mt-4">{error}</Feedback>}
    <p role="status" className={pending ? "mt-4 text-secondary" : "sr-only"}>{pending ? "Deactivation in progress. Please wait." : ""}</p>
    <div className="mt-6 flex flex-wrap justify-end gap-4">
      <button ref={cancel} type="button" className="button button-secondary" disabled={pending} onClick={onCancel}>Cancel</button>
      <Button type="button" variant="danger" disabled={pending} onClick={onConfirm}>{pending ? "Deactivating…" : confirmLabel}</Button>
    </div>
  </dialog>;
}

export const resourceDeactivationDescription = "Deactivation prevents new bookings. Historical reservations are preserved; this action does not cancel existing reservations.";
