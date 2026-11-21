import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/auth/users";
import { formatCount } from "@/domain/format";
import { DATASET_FILE, type Dataset } from "@/domain/orders";
import { dataPeriod, formatPeriod, formatYears } from "@/domain/periods";
import { LiveRailAiStatus } from "./ai-status";
import { Icon } from "./icons";
import { Rail } from "./rail";
import { RailAccount } from "./rail-account";
import { RailNav } from "./rail-nav";

/**
 * The shell of every page (ADR 0011 §5): a skip link, the dark rail with the product name, the menu,
 * the data and the AI status, then the page. Where the two fit side by side, the rail is 232 px wide,
 * or 64 px collapsed, and the page takes the rest up to its 1200 px; below that, the rail stacks above
 * the page (ticket 27). The menu lists the pages the user's role can open, and the rail ends with who is
 * signed in and Sign out (ticket 31).
 */
export function AppShell({
  user,
  dataset,
  modelName,
  railCollapsed,
  children,
}: {
  user: User;
  dataset: Dataset;
  modelName: string;
  /** The viewer's kept choice, from the rail cookie. */
  railCollapsed: boolean;
  children: ReactNode;
}) {
  const period = dataPeriod(dataset.orders);
  return (
    <>
      <a
        href="#content"
        className="sr-only rounded-control bg-amber px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col beside:flex-row">
        <Rail
          initiallyCollapsed={railCollapsed}
          brand={
            <div className="flex items-center gap-2.5 px-2 py-1">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-control bg-sage/16 text-sage">
                <Icon name="box" size={20} />
              </span>
              <span className="flex flex-col whitespace-nowrap">
                <span className="text-card-title text-panel">Logistics Analytics</span>
                <span className="text-note text-rail-muted">{`Order data, ${formatYears(period)}`}</span>
              </span>
            </div>
          }
          dataCard={
            <div className="relative p-3.5">
              {/* Collapsed, the card fades to the AI dot, which keeps its place; the words stay for screen readers. */}
              <span aria-hidden="true" className="rail-fade absolute inset-0 rounded-inset border border-panel/8 bg-panel/4" />
              <div className="relative flex flex-col gap-2.5 beside:w-[180px]">
                <div className="rail-fade flex flex-col gap-2.5">
                  <span className="text-label text-rail-muted uppercase">Data</span>
                  {/* The file's name opens its rows (ticket 28). Collapsed, the link would take focus unseen, so it hides once faded and only the words stay. */}
                  <Link
                    href="/data"
                    className="self-start text-small font-medium text-panel underline decoration-panel/30 underline-offset-[3px] transition-[visibility] hover:text-panel hover:decoration-panel rail-collapsed:invisible"
                  >
                    {DATASET_FILE}
                  </Link>
                  <span className="sr-only hidden rail-collapsed:inline">{DATASET_FILE}</span>
                  <span className="text-note text-rail-muted">{`${formatCount(dataset.orders.length)} orders · ${formatPeriod(period)} · read-only`}</span>
                  <div className="h-px bg-panel/8" />
                </div>
                <LiveRailAiStatus modelName={modelName} dataFile={DATASET_FILE} />
              </div>
            </div>
          }
          account={<RailAccount user={user} />}
        >
          <RailNav role={user.role} />
        </Rail>
        <main id="content" className="min-w-0 flex-1 px-4 pt-7 pb-16 sm:px-9">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5">{children}</div>
        </main>
      </div>
    </>
  );
}
