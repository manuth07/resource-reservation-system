"use client";
import { useEffect, useRef } from "react";

// Close the same-tick gap before React renders pending/disabled controls.
export function useSubmissionLock(pending: boolean) {
  const locked = useRef(false);
  useEffect(() => { if (!pending) locked.current = false; }, [pending]);
  return {
    acquire() { if (pending || locked.current) return false; locked.current = true; return true; },
    release() { locked.current = false; },
  };
}
