import type { ReactNode } from "react";
import { formatCount } from "@/domain/format";
import { DATASET_FILE, type Dataset } from "@/domain/orders";
import { dataPeriod, formatPeriod, formatYears } from "@/domain/periods";
import { LiveRailAiStatus } from "./ai-status";
import { Icon } from "./icons";
import { RailNav } from "./rail-nav";

/**
 * The shell of every page (ADR 0011 §5): a skip link, the dark rail with the product name, the menu,
 * the data and the AI status, then the page. The rail is 232 px wide beside the content, and stacks
 * above it when the two no longer fit side by side.
 */
export function AppShell({ dataset, children }: { dataset: Dataset; children: ReactNode }) {
  const period = dataPeriod(dataset.orders);
  return (
    <>
      <a
        href="#content"
        className="sr-only rounded-control bg-amber px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen flex-wrap items-stretch">
        <header className="flex max-w-full flex-[1_1_232px] flex-col gap-6 bg-rail px-3 py-5 text-rail-ink">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <span className="grid size-[34px] place-items-center rounded-control bg-sage/16 text-sage">
              <Icon name="box" size={20} />
            </span>
            <span className="flex flex-col">
              <span className="text-card-title text-panel">Logistics Analytics</span>
              <span className="text-note text-rail-muted">{`Order data, ${formatYears(period)}`}</span>
            </span>
          </div>
          <RailNav />
          <div className="grow" />
          <div className="flex flex-col gap-2.5 rounded-inset border border-panel/8 bg-panel/4 p-3.5">
            <span className="text-label text-rail-muted uppercase">Data</span>
            <span className="text-small font-medium text-panel">{DATASET_FILE}</span>
            <span className="text-note text-rail-muted">{`${formatCount(dataset.orders.length)} orders · ${formatPeriod(period)} · read-only`}</span>
            <div className="h-px bg-panel/8" />
            <LiveRailAiStatus />
          </div>
        </header>
        <main id="content" className="min-w-0 flex-[999_1_560px] px-4 pt-7 pb-16 sm:px-9">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5">{children}</div>
        </main>
      </div>
    </>
  );
}
