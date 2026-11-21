"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type Action, can, type Role } from "@/auth/roles";
import { Icon, type IconName } from "./icons";

/** The pages in the rail (ADR 0011 §5), each with the action the roles matrix asks for (ticket 31). */
const PAGES: readonly { href: string; label: string; icon: IconName; action: Action }[] = [
  { href: "/", label: "Overview", icon: "grid", action: "dashboards" },
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
 */
export function NavLinks({ pathname, role }: { pathname: string | null; role: Role }) {
  return (
    <nav aria-label="Pages">
      <ul className="flex flex-col gap-0.5">
        {PAGES.filter(({ action }) => can(role, action)).map(({ href, label, icon }) => {
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
                <span className="rail-fade">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function RailNav({ role }: { role: Role }) {
  return <NavLinks pathname={usePathname()} role={role} />;
}
