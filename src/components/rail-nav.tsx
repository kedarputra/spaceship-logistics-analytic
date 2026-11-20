"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

/** The pages in the rail (ADR 0011 §5). Ticket 25 adds Delivery, Carriers and Forecast. */
const PAGES: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/ask", label: "Ask the data", icon: "ask" },
];

/** The menu, with the current page marked: an amber bar, an amber tint, and aria-current. */
export function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Pages">
      <ul className="flex flex-col gap-0.5">
        {PAGES.map(({ href, label, icon }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "relative flex min-h-10 items-center gap-2.5 rounded-control bg-amber/14 px-3 font-semibold text-amber no-underline hover:text-amber"
                    : "flex min-h-10 items-center gap-2.5 rounded-control px-3 text-rail-ink no-underline hover:bg-panel/6 hover:text-panel"
                }
              >
                {current ? <span aria-hidden="true" className="absolute top-[11px] -left-3 h-[18px] w-[3px] rounded-r-mark bg-amber" /> : null}
                <Icon name={icon} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RailNav() {
  return <NavLinks pathname={usePathname()} />;
}
