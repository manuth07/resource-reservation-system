"use client";
import { useState, useTransition } from "react";
import { setResourceActiveAction } from "@/app/resource-actions";
import { Button, Feedback } from "@/components/ui";
import { ConfirmationDialog, resourceDeactivationDescription } from "@/components/confirmation-dialog";
import type { ResourceRecord } from "@/lib/resource-types";
import { useSubmissionLock } from "@/components/use-submission-lock";

export function ResourceStatusControl({ resource }: { resource: Pick<ResourceRecord, "id" | "name" | "isActive" | "updatedAt"> }) {
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const submission = useSubmissionLock(pending);
  function updateStatus() {
    if (!submission.acquire()) return;
    setMessage({});
    const data = new FormData(); data.set("id", resource.id); data.set("updatedAt", resource.updatedAt); data.set("active", String(!resource.isActive));
    startTransition(async () => {
      try {
        const result = await setResourceActiveAction(data);
        if (result.error) setMessage(result);
        else { setMessage({ success: `Resource ${resource.isActive ? "deactivated" : "activated"} successfully.` }); setOpen(false); }
      } catch { setMessage({ error: "The operation could not be completed. Reload and try again." }); }
    });
  }
  return <div className="max-w-64 space-y-2" aria-busy={pending}>
    <Button type="button" variant="secondary" className="whitespace-nowrap" disabled={pending} aria-label={`${resource.isActive ? "Deactivate" : "Activate"} ${resource.name}`} onClick={() => { if (resource.isActive) { setMessage({}); setOpen(true); } else updateStatus(); }}>{pending ? "Updating…" : resource.isActive ? "Deactivate" : "Activate"}</Button>
    <span role="status" className="sr-only">{pending ? "Updating resource status…" : ""}</span>
    {message.error && !open && <Feedback tone="danger">{message.error}</Feedback>}
    {message.success && <Feedback tone="success">{message.success}</Feedback>}
    <ConfirmationDialog open={open} title={`Deactivate ${resource.name}?`} description={resourceDeactivationDescription} confirmLabel="Deactivate resource" pending={pending} error={message.error} onCancel={() => setOpen(false)} onConfirm={updateStatus} />
  </div>;
}
