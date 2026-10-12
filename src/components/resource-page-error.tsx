"use client";
import { Button, Card } from "@/components/ui";

export function ResourcePageError({ reset }: { reset: () => void }) {
  return <Card className="p-8"><h2 className="section-title">Unable to load resources</h2><p role="alert" className="mt-2 text-secondary">The request could not be completed. Try again or return to your dashboard.</p><Button type="button" className="mt-6" onClick={reset}>Try again</Button></Card>;
}
