"use client";

import { useEffect, useId, useRef } from "react";
import { Button, Feedback } from "@/components/ui";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  pending = false,
  error,
  onCancel,
  onConfirm,
  pendingLabel = "Deactivating…",
  pendingMessage = "Deactivation in progress. Please wait.",
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  pendingLabel?: string;
  pendingMessage?: string;
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
  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog text-left whitespace-normal"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id={`${id}-title`} className="section-title text-left">
        {title}
      </h2>
      <div id={`${id}-description`} className="mt-4 text-sm leading-relaxed text-secondary whitespace-pre-line text-left">
        {description}
      </div>
      {error && (
        <Feedback tone="danger" className="mt-4 text-left">
          {error}
        </Feedback>
      )}
      <p role="status" className={pending ? "mt-4 text-secondary text-left text-sm" : "sr-only"}>
        {pending ? pendingMessage : ""}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-4">
        <button
          ref={cancel}
          type="button"
          className="button button-secondary"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export const resourceDeactivationDescription = "Deactivation prevents new bookings. Historical reservations are preserved; this action does not cancel existing reservations.";
