import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { modelDisplayName } from "@/ai/config";
import { AppShell } from "@/components/app-shell";
import { getDataset } from "@/domain/orders";
import "./globals.css";

// Downloaded at build time and served from this app (ADR 0011 §4): no visitor's browser calls Google.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Logistics Analytics",
  description: "KPIs, questions in plain language, and demand forecasts over one dataset of logistics orders.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        <AppShell dataset={getDataset()} modelName={modelDisplayName()}>{children}</AppShell>
      </body>
    </html>
  );
}
