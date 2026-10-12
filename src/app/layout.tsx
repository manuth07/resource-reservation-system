import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Urbanist } from "next/font/google";
import { LoadingState } from "@/components/ui";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body-face", display: "swap" });
const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-heading-face", display: "swap" });

export const metadata: Metadata = {
  title: "PrimeWave | Resource Reservation",
  description: "Your internal resource reservation workspace",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${urbanist.variable}`}
    >
      <body className="min-h-full flex flex-col"><Suspense fallback={<LoadingState />}>{children}</Suspense></body>
    </html>
  );
}
