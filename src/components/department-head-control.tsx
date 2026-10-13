"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  designateDepartmentHeadAction,
  promoteAndDesignateHeadAction,
} from "@/app/department-actions";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button, Card, Feedback, FormField, StatusBadge } from "@/components/ui";
import type { DepartmentMemberSummary, DepartmentRecord } from "@/lib/department-types";

type Props = {
  department: DepartmentRecord;
  members: DepartmentMemberSummary[];
};

export function DepartmentHeadControl({ department, members }: Props) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "replace" | "remove" | "promote";
    targetUserId?: string;
    targetUserName?: string;
  }>({
    open: false,
    type: "replace",
  });

  const currentHead = department.head;
  const activeMembers = members.filter((m) => m.accountStatus === "ACTIVE");
  const hodMembers = activeMembers.filter((m) => m.role === "DEPARTMENT_HEAD");
  const employeeMembers = activeMembers.filter((m) => m.role === "EMPLOYEE");

  const handleDesignate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedUserId) {
      setError("Please select a department member.");
      return;
    }

    const candidate = activeMembers.find((m) => m.id === selectedUserId);
    if (!candidate) return;

    if (candidate.role === "EMPLOYEE") {
      setConfirmDialog({
        open: true,
        type: "promote",
        targetUserId: candidate.id,
        targetUserName: candidate.name,
      });
      return;
    }

    if (currentHead && currentHead.id !== candidate.id) {
      setConfirmDialog({
        open: true,
        type: "replace",
        targetUserId: candidate.id,
        targetUserName: candidate.name,
      });
      return;
    }

    executeDesignation(candidate.id, false);
  };

  const handleRemove = () => {
    setError(null);
    setConfirmDialog({
      open: true,
      type: "remove",
    });
  };

  const executeDesignation = (headId: string | null, isPromote: boolean) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("departmentId", department.id);

      let res;
      if (isPromote && headId) {
        fd.set("userId", headId);
        res = await promoteAndDesignateHeadAction(fd);
      } else {
        fd.set("headId", headId ?? "unassign");
        res = await designateDepartmentHeadAction(fd);
      }

      if (res.error) {
        setError(res.error);
      } else {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        setSelectedUserId("");
        router.refresh();
      }
    });
  };

  return (
    <Card className="p-6 sm:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="section-title">Department Head designation</h2>
          <p className="mt-1 text-sm text-secondary">
            The designated Department Head reviews and decides resource reservation requests for this department.
          </p>
        </div>
        <div>
          {currentHead ? (
            <StatusBadge tone="success">Assigned</StatusBadge>
          ) : (
            <StatusBadge tone="warning">Unassigned</StatusBadge>
          )}
        </div>
      </div>

      {error && <Feedback tone="danger">{error}</Feedback>}

      {/* Current Head Display */}
      {currentHead ? (
        <div className="rounded border border-border bg-surface p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {currentHead.name}{" "}
              <span className="font-mono text-xs font-normal text-secondary">
                ({currentHead.employeeId})
              </span>
            </p>
            <p className="text-xs text-secondary mt-0.5">{currentHead.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted">Role: Department Head</span>
              <span className="text-xs text-muted">•</span>
              <StatusBadge
                tone={currentHead.accountStatus === "ACTIVE" ? "success" : "neutral"}
                subtle
              >
                {currentHead.accountStatus === "ACTIVE" ? "Active" : "Inactive"}
              </StatusBadge>
            </div>
          </div>
          <div>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={handleRemove}
            >
              Remove designation
            </Button>
          </div>
        </div>
      ) : (
        <Feedback tone="warning">
          <strong>No Department Head assigned.</strong> New reservation requests for {department.name} will be blocked during administrative review until an active Department Head is designated.
        </Feedback>
      )}

      {/* Designation / Replacement Form */}
      <form onSubmit={handleDesignate} className="pt-2 border-t border-border space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          {currentHead ? "Replace Department Head" : "Designate Department Head"}
        </h3>
        <p className="text-xs text-secondary">
          Select an active department member. Users with the Department Head role will be designated immediately; employees will be promoted to Department Head and designated.
        </p>

        {activeMembers.length === 0 ? (
          <p className="text-sm text-muted italic">
            This department has no active employees. Create or transfer employees to this department first.
          </p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <FormField
                id="select-hod"
                label="Select department member"
                required
              >
                <select
                  id="select-hod"
                  className="field w-full"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  disabled={isPending}
                  required
                >
                  <option value="">Choose an eligible member…</option>
                  {hodMembers.length > 0 && (
                    <optgroup label="Department Heads in this department">
                      {hodMembers.map((m) => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={m.id === currentHead?.id}
                        >
                          {m.name} ({m.employeeId})
                          {m.id === currentHead?.id ? " [Current Head]" : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {employeeMembers.length > 0 && (
                    <optgroup label="Employees (will be promoted to Department Head)">
                      {employeeMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.employeeId}) [Promote to HOD]
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </FormField>
            </div>

            <div>
              <Button
                type="submit"
                variant="primary"
                disabled={isPending || !selectedUserId}
              >
                {isPending
                  ? "Updating…"
                  : currentHead
                  ? "Replace Head"
                  : "Designate as Head"}
              </Button>
            </div>
          </div>
        )}
      </form>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={confirmDialog.open && confirmDialog.type === "replace"}
        title="Replace Department Head"
        description={`Are you sure you want to replace ${currentHead?.name} with ${confirmDialog.targetUserName} as Head of ${department.name}? The previous head will immediately lose authority to decide departmental reservation requests, and the new head will be granted authorization.`}
        confirmLabel="Confirm replacement"
        pendingLabel="Replacing…"
        pending={isPending}
        error={error ?? undefined}
        onCancel={() => {
          if (!isPending) setConfirmDialog((p) => ({ ...p, open: false }));
        }}
        onConfirm={() => {
          if (confirmDialog.targetUserId) {
            executeDesignation(confirmDialog.targetUserId, false);
          }
        }}
      />

      <ConfirmationDialog
        open={confirmDialog.open && confirmDialog.type === "promote"}
        title="Promote and Designate as Department Head"
        description={`Are you sure you want to promote ${confirmDialog.targetUserName} to Department Head and designate them as the Head of ${department.name}?`}
        confirmLabel="Promote & designate"
        pendingLabel="Promoting…"
        pending={isPending}
        error={error ?? undefined}
        onCancel={() => {
          if (!isPending) setConfirmDialog((p) => ({ ...p, open: false }));
        }}
        onConfirm={() => {
          if (confirmDialog.targetUserId) {
            executeDesignation(confirmDialog.targetUserId, true);
          }
        }}
      />

      <ConfirmationDialog
        open={confirmDialog.open && confirmDialog.type === "remove"}
        title="Remove Department Head Designation"
        description={`Are you sure you want to remove ${currentHead?.name} as the designated Head of ${department.name}? This department will have no active head, and new reservation requests will be blocked from forwarding until a new head is assigned.`}
        confirmLabel="Remove designation"
        pendingLabel="Removing…"
        pending={isPending}
        error={error ?? undefined}
        onCancel={() => {
          if (!isPending) setConfirmDialog((p) => ({ ...p, open: false }));
        }}
        onConfirm={() => executeDesignation(null, false)}
      />
    </Card>
  );
}
