"use client";
import { useState, useTransition } from "react";
import { setResourceActiveAction } from "@/app/resource-actions";
import { Button } from "@/components/ui";
import type { ResourceRecord } from "@/lib/resource-types";

export function ResourceStatusControl({ resource }: { resource: Pick<ResourceRecord, "id" | "name" | "isActive" | "updatedAt"> }) {
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  return <div className="space-y-2"><Button type="button" variant="secondary" disabled={pending} aria-label={`${resource.isActive ? "Deactivate" : "Activate"} ${resource.name}`} onClick={() => {
    if (resource.isActive && !window.confirm(`Deactivate ${resource.name}? Existing reservation history will be preserved.`)) return;
    setMessage({});
    const data = new FormData(); data.set("id", resource.id); data.set("updatedAt", resource.updatedAt); data.set("active", String(!resource.isActive));
    startTransition(async () => { try { const result = await setResourceActiveAction(data); setMessage(result.error ? result : { success: `Resource ${resource.isActive ? "deactivated" : "activated"} successfully.` }); } catch { setMessage({ error: "The operation could not be completed. Reload and try again." }); } });
  }}>{pending ? "Updating…" : resource.isActive ? "Deactivate" : "Activate"}</Button>{message.error && <p role="alert" className="text-danger text-xs">{message.error}</p>}{message.success && <p role="status" className="text-success text-xs">{message.success}</p>}</div>;
}
