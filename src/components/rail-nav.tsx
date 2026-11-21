"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Action, can, type Role } from "@/auth/roles";
import { formatCount } from "@/domain/format";
import { Icon, type IconName } from "./icons";

/** The pages in the rail (ADR 0011 §5), each with the action the roles matrix asks for (ticket 31). */
const PAGES: readonly { href: string; label: string; icon: IconName; action: Action; overdueBadge?: true }[] = [
  { href: "/", label: "Overview", icon: "grid", action: "dashboards" },
  { href: "/attention", label: "Needs attention", icon: "alert", action: "dashboards", overdueBadge: true },
  { href: "/ask", label: "Ask the data", icon: "ask", action: "ask" },
  { href: "/delivery", label: "Delivery", icon: "truck", action: "dashboards" },
  { href: "/carriers", label: "Carriers", icon: "bars", action: "dashboards" },
  { href: "/forecast", label: "Forecast", icon: "trend", action: "dashboards" },
  { href: "/data", label: "Raw data", icon: "table", action: "dashboards" },
  { href: "/users", label: "Users", icon: "users", action: "users" },
];

const LINK_CLASSES = "relative flex min-h-10 items-center gap-2.5 rounded-control px-3 whitespace-nowrap no-underline";

/**
 * The menu: the pages the role can open (ticket 31), with the current one marked by an amber bar, an
 * amber tint, and aria-current. On the collapsed rail only the icons show, in the same place; each
 * name fades out but stays as its link's accessible name and becomes its tooltip (tickets 27, 30).
 * Needs attention shows the orders overdue in transit after its name, and collapsed a dot on its icon;
 * the count is in the link's name and the tooltip, as "26 overdue" (ticket 32). 0 has no badge.
 */
export function NavLinks({ pathname, role, overdue = 0 }: { pathname: string | null; role: Role; overdue?: number }) {
  return (
    <nav aria-label="Pages">
      <ul className="flex flex-col gap-0.5">
        {PAGES.filter(({ action }) => can(role, action)).map(({ href, label, icon, overdueBadge }) => {
          const current = pathname === href;
          const badge = overdueBadge ? overdue : 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                data-tip={badge > 0 ? `${label} · ${formatCount(badge)} overdue` : label}
                className={
                  current
                    ? `${LINK_CLASSES} bg-amber/14 font-semibold text-amber hover:text-amber`
                    : `${LINK_CLASSES} text-rail-ink hover:bg-panel/6 hover:text-panel`
                }
              >
                {current ? <span aria-hidden="true" className="absolute top-[11px] -left-3 h-[18px] w-[3px] rounded-r-mark bg-amber" /> : null}
                <Icon name={icon} className="shrink-0" />
                <span className="rail-fade">{label}</span>
                {badge > 0 ? (
                  <>
                    <span className="rail-fade ml-auto rounded-full bg-warn-tint px-1.5 text-note font-bold text-warn-ink">
                      {formatCount(badge)}
                      <span className="sr-only"> overdue</span>
                    </span>
                    {/* Collapsed, the count fades with the name and a dot on the icon stays. */}
                    <span aria-hidden="true" className="absolute top-[9px] left-[26px] hidden size-2 rounded-full bg-warn-tint ring-2 ring-rail rail-collapsed:block" />
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RailNav({ role, overdue }: { role: Role; overdue?: number }) {
  return <NavLinks pathname={usePathname()} role={role} overdue={overdue} />;
}
