import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { modelDisplayName } from "@/ai/config";
import { AppShell } from "@/components/app-shell";
import { isRailCollapsed, RAIL_COOKIE } from "@/components/rail-state";
import { currentViewer } from "./auth";
import "./globals.css";

// Downloaded at build time and served from this app (ADR 0011 §4): no visitor's browser calls Google.
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Logistics Analytics",
  description: "KPIs, questions in plain language, and demand forecasts over one dataset of logistics orders.",
};

/**
 * Every page. Signed in, the shell with the rail for the user's role and the session's active dataset
 * (ticket 35); signed out, which only the sign-in page ever is, the page alone on the ground (ticket 31).
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The rail as the viewer last left it (ticket 27), so the first paint has the right width.
  const railCollapsed = isRailCollapsed((await cookies()).get(RAIL_COOKIE)?.value);
  const viewer = await currentViewer();
  return (
    <html lang="en" className={figtree.variable}>
      <body>
        {viewer === undefined ? (
          <main id="content" className="grid min-h-dvh place-items-center px-4 py-10">
            {children}
          </main>
        ) : (
          <AppShell user={viewer.user} dataset={viewer.dataset} modelName={modelDisplayName()} railCollapsed={railCollapsed}>
            {children}
          </AppShell>
        )}
      </body>
    </html>
  );
}
