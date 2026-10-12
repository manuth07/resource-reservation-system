"use client";
import { useEffect, type RefObject } from "react";
import type { ResourceActionResult } from "@/lib/resource-types";

/** Native validation focuses its own errors; focus server field errors after return. */
export function useValidationFocus(form: RefObject<HTMLFormElement | null>, errors: ResourceActionResult["fieldErrors"], enabled = true) {
  useEffect(() => {
    if (!enabled || !errors || !Object.keys(errors).length) return;
    form.current?.querySelector<HTMLElement>('input[aria-invalid="true"]:not(:disabled):not([type="hidden"]), select[aria-invalid="true"]:not(:disabled), textarea[aria-invalid="true"]:not(:disabled)')?.focus();
  }, [form, errors, enabled]);
}
