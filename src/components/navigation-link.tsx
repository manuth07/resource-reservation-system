"use client";
import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingHint() {
  const { pending } = useLinkStatus();
  return <span role="status" aria-live="polite" className="inline-flex min-w-4 items-center">{pending && <><span aria-hidden="true" className="inline-block size-3 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" /><span className="sr-only">Opening page…</span></>}</span>;
}

export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}><span>{children}</span><PendingHint /></Link>;
}
