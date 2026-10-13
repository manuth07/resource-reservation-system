"use client";
import { NavigationLink as Link } from "@/components/navigation-link";
import { useActionState, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { saveResourceAction } from "@/app/resource-actions";
import { Button, Card, Feedback, FormField, Input, Select } from "@/components/ui";
import { ConfirmationDialog, resourceDeactivationDescription } from "@/components/confirmation-dialog";
import type { ResourceActionResult, ResourceCategoryOption, ResourceRecord } from "@/lib/resource-types";
import { useSubmissionLock } from "@/components/use-submission-lock";
import { useValidationFocus } from "@/components/use-validation-focus";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ResourceForm({
  categories,
  resource,
  policyLocked = false,
}: {
  categories: ResourceCategoryOption[];
  resource?: ResourceRecord;
  policyLocked?: boolean;
}) {
  const [state, action, pending] = useActionState(saveResourceAction, {} as ResourceActionResult);
  const submission = useSubmissionLock(pending);
  const form = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmed = useRef(false);
  const wasPending = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useValidationFocus(form, state.fieldErrors, !pending && !confirmOpen);

  const [name, setName] = useState(resource?.name ?? "");
  const [code, setCode] = useState(resource?.resourceCode ?? "");
  const [capacity, setCapacity] = useState(String(resource?.capacity ?? ""));
  const [location, setLocation] = useState(resource?.location ?? "");
  const [active, setActive] = useState(resource?.isActive ?? true);
  const [categoryId, setCategoryId] = useState(resource?.categoryId ?? "");
  const [approval, setApproval] = useState(resource?.requiresApproval ?? false);

  // Photo management state
  const [imageUrl, setImageUrl] = useState<string | null>(resource?.imageUrl ?? null);
  const [imagePath, setImagePath] = useState<string | null>(resource?.imagePath ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(resource?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const vehicle = categories.find((category) => category.id === categoryId)?.isVehicle ?? false;
  const approvalValue = policyLocked ? !!resource?.requiresApproval : vehicle || approval;
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      wasPending.current = false;
      confirmed.current = false;
      setConfirmOpen(false);
    }
  }, [pending]);

  async function handleFileSelected(file: File) {
    setUploadError(null);

    // Client-side MIME validation
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("Only standard JPEG, PNG, or WebP images are permitted.");
      return;
    }

    // Client-side file size validation (3 MB)
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Image size exceeds the 3 MB limit. Please select a smaller photo.");
      return;
    }

    // Generate local preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setRemoveImage(false);
    setUploading(true);

    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const targetNamespace = `resources/${resource?.id ?? "drafts"}/${Date.now()}-${sanitizedName}`;

      const blob = await upload(targetNamespace, file, {
        access: "public",
        handleUploadUrl: "/api/resource-photo/upload",
      });

      setImageUrl(blob.url);
      setImagePath(blob.pathname);
      setPreviewUrl(blob.url);
      setUploading(false);
    } catch (err) {
      setUploading(false);
      // Revert preview if upload failed
      setPreviewUrl(resource?.imageUrl && !removeImage ? resource.imageUrl : null);
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setUploadError(msg);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void handleFileSelected(file);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFileSelected(file);
    }
  }

  function handleRemovePhoto() {
    setRemoveImage(true);
    setImageUrl(null);
    setImagePath(null);
    setPreviewUrl(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const hasPhoto = Boolean(previewUrl && !removeImage);

  return (
    <Card className="resource-editor">
      <div className="editor-heading">
        <h2 className="card-title">Resource details</h2>
        <p className="supporting-text mt-1">
          Identify the resource, then set its operational policy and photograph.
        </p>
      </div>

      {policyLocked && (
        <Feedback tone="info" className="mb-4">
          Reservation history protects this resource&apos;s category and approval policy.
          Operational details and status can still be edited.
        </Feedback>
      )}

      <form
        ref={form}
        action={action}
        aria-busy={pending || uploading}
        className="space-y-5"
        onSubmit={(event) => {
          if (uploading) {
            event.preventDefault();
            return;
          }
          if (!submission.acquire()) {
            event.preventDefault();
            return;
          }
          if (resource?.isActive && !active && !confirmed.current) {
            event.preventDefault();
            submission.release();
            setConfirmOpen(true);
            return;
          }
          confirmed.current = false;
        }}
      >
        {resource && (
          <>
            <input type="hidden" name="id" value={resource.id} />
            <input type="hidden" name="updatedAt" value={resource.updatedAt} />
          </>
        )}

        {/* Photo hidden inputs for form submission */}
        {removeImage ? (
          <input type="hidden" name="removeImage" value="true" />
        ) : imageUrl ? (
          <>
            <input type="hidden" name="imageUrl" value={imageUrl} />
            <input type="hidden" name="imagePath" value={imagePath ?? ""} />
          </>
        ) : null}

        <fieldset disabled={pending || uploading} className="grid gap-5 sm:grid-cols-2">
          <FormField id="resource-name" label="Resource name" required error={errors.name}>
            <Input
              id="resource-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "resource-name-error" : undefined}
            />
          </FormField>

          <FormField
            id="resource-code"
            label="Resource code"
            required
            hint="2–64 letters, numbers, hyphens or underscores."
            error={errors.resourceCode}
          >
            <Input
              id="resource-code"
              name="resourceCode"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
              minLength={2}
              maxLength={64}
              pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{1,63}"}
              aria-invalid={!!errors.resourceCode}
              aria-describedby={`resource-code-hint${errors.resourceCode ? " resource-code-error" : ""}`}
            />
          </FormField>

          <FormField id="resource-category" label="Category" required error={errors.categoryId}>
            <Select
              id="resource-category"
              name="categoryId"
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={policyLocked}
              aria-invalid={!!errors.categoryId}
              aria-describedby={errors.categoryId ? "resource-category-error" : undefined}
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.isVehicle ? " (vehicle)" : ""}
                </option>
              ))}
            </Select>
            {policyLocked && <input type="hidden" name="categoryId" value={categoryId} />}
          </FormField>

          <FormField
            id="resource-capacity"
            label="Capacity (optional)"
            hint="Positive whole number, or leave empty."
            error={errors.capacity}
          >
            <Input
              id="resource-capacity"
              name="capacity"
              type="number"
              min={1}
              max={2147483647}
              step={1}
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              aria-invalid={!!errors.capacity}
              aria-describedby={`resource-capacity-hint${errors.capacity ? " resource-capacity-error" : ""}`}
              className="tabular-nums"
            />
          </FormField>

          {vehicle ? (
            <input type="hidden" name="location" value={location} />
          ) : (
            <div className="sm:col-span-2">
              <FormField
                id="resource-location"
                label="Location (optional)"
                hint="For example: 2nd Floor, Building A or IT Equipment Store."
                error={errors.location}
              >
                <Input
                  id="resource-location"
                  name="location"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  maxLength={200}
                  aria-invalid={!!errors.location}
                  aria-describedby={`resource-location-hint${errors.location ? " resource-location-error" : ""}`}
                />
              </FormField>
            </div>
          )}

          {/* Photo Management Section */}
          <div className="editor-section sm:col-span-2 space-y-3">
            <h2 className="card-title">Resource photograph</h2>
            <p className="supporting-text">
              Upload a photograph to identify this resource in directory tables and detail views.
              Accepts JPEG, PNG, or WebP up to 3 MB.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              id="resource-photo-input"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={pending || uploading}
              className="sr-only"
              aria-label="Upload resource photograph"
            />

            {hasPhoto ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-md border border-border p-4 bg-surface">
                {/* Image preview */}
                <div className="relative size-20 sm:size-24 shrink-0 overflow-hidden rounded border border-border bg-table-header">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl!}
                    alt={`Preview of ${name || "resource"}`}
                    className="size-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {uploading ? "Uploading photograph…" : "Photograph attached"}
                  </p>
                  <p className="supporting-text text-xs">
                    {uploading
                      ? "Direct upload to storage in progress. Please wait before saving."
                      : imageUrl
                      ? "Uploaded and ready to be saved with the resource."
                      : "Existing photograph attached to this resource."}
                  </p>
                  {uploadError && (
                    <p className="text-xs text-danger font-medium">{uploadError}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                  <Button
                    type="button"
                    variant="neutral"
                    size="sm"
                    disabled={pending || uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace photo
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={pending || uploading}
                    onClick={handleRemovePhoto}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md transition-colors ${
                  isDragOver
                    ? "border-primary bg-navigation-selected/20"
                    : "border-border hover:border-secondary bg-surface"
                }`}
              >
                <div className="text-center space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Drop photo here, or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={pending || uploading}
                      className="text-primary font-semibold hover:underline focus:outline-none"
                    >
                      browse file
                    </button>
                  </p>
                  <p className="supporting-text text-xs">
                    JPEG, PNG, or WebP up to 3 MB (max 4096×4096px).
                  </p>
                  {uploading && (
                    <p className="text-xs text-primary font-medium">Uploading to storage…</p>
                  )}
                  {uploadError && (
                    <p className="text-xs text-danger font-medium">{uploadError}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="editor-section sm:col-span-2 space-y-3">
            <h2 className="card-title">Operational &amp; booking policy</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="check-option">
                <input
                  type="checkbox"
                  name="isActive"
                  value="true"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Operationally active
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  name="requiresApproval"
                  value="true"
                  checked={approvalValue}
                  onChange={(event) => setApproval(event.target.checked)}
                  disabled={policyLocked || vehicle}
                  aria-describedby="approval-help"
                  className="size-4 accent-primary"
                />
                Requires approval
              </label>
            </div>
            {(policyLocked || vehicle) && (
              <input type="hidden" name="requiresApproval" value={String(approvalValue)} />
            )}
            <p id="approval-help" className="supporting-text">
              {vehicle
                ? "Vehicle requests require approval. An Admin assigns the vehicle and driver."
                : "Standard resources may require Department Head approval. Leave approval off to use a direct booking policy."}
            </p>
            <p className="supporting-text">
              Active indicates operational status, not availability for a particular date or time.
            </p>
          </div>

          <div className="editor-actions sm:col-span-2">
            <Link href="/admin/resources" className="button button-secondary">
              Cancel
            </Link>
            <Button type="submit" disabled={pending || uploading}>
              {pending
                ? "Saving…"
                : uploading
                ? "Uploading photo…"
                : resource
                ? "Save resource"
                : "Create resource"}
            </Button>
          </div>
        </fieldset>

        {state.error && (!Object.keys(errors).length || (vehicle && errors.location)) && (
          <Feedback tone="danger">{state.error}</Feedback>
        )}
        <p role="status" className="sr-only">
          {pending ? "Saving resource" : uploading ? "Uploading photograph" : ""}
        </p>
      </form>

      <ConfirmationDialog
        open={confirmOpen}
        title={`Deactivate ${resource?.name ?? "resource"}?`}
        description={`${resourceDeactivationDescription} Other form changes will also be saved.`}
        confirmLabel="Deactivate and save"
        pending={pending}
        onCancel={() => {
          confirmed.current = false;
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          confirmed.current = true;
          form.current?.requestSubmit();
        }}
      />
    </Card>
  );
}
