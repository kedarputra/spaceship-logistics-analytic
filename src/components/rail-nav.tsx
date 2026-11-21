"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

/** The pages in the rail (ADR 0011 §5). */
const PAGES: readonly { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/ask", label: "Ask the data", icon: "ask" },
  { href: "/delivery", label: "Delivery", icon: "truck" },
  { href: "/carriers", label: "Carriers", icon: "bars" },
  { href: "/forecast", label: "Forecast", icon: "trend" },
  { href: "/data", label: "Raw data", icon: "table" },
];

const LINK_CLASSES = "relative flex min-h-10 items-center gap-2.5 rounded-control px-3 whitespace-nowrap no-underline rail-collapsed:justify-center rail-collapsed:px-0";

/**
 * The menu, with the current page marked: an amber bar, an amber tint, and aria-current. On the
 * collapsed rail only the icons show; each name stays as its link's accessible name and becomes its
 * tooltip (ticket 27).
 */
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
                data-tip={label}
                className={
                  current
                    ? `${LINK_CLASSES} bg-amber/14 font-semibold text-amber hover:text-amber`
                    : `${LINK_CLASSES} text-rail-ink hover:bg-panel/6 hover:text-panel`
                }
              >
                {current ? <span aria-hidden="true" className="absolute top-[11px] -left-3 h-[18px] w-[3px] rounded-r-mark bg-amber" /> : null}
                <Icon name={icon} className="shrink-0" />
                <span className="rail-collapsed:sr-only">{label}</span>
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
