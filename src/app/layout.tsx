import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrimeWave | Resource Reservation",
  description: "Your internal resource reservation workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col"><Suspense fallback={<p role="status" className="p-8 text-sm text-slate-500">Loading your workspace…</p>}>{children}</Suspense></body>
    </html>
  );
}
