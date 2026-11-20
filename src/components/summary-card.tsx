import Link from "next/link";
import type { ReactNode } from "react";
import { CardTitle } from "./card-title";
import { Icon } from "./icons";

/** An Overview card that sums something up and links to where it is shown in full (ticket 24). */
export function SummaryCard({
  id,
  title,
  caption,
  badge,
  link,
  children,
}: {
  id: string;
  title: string;
  caption: string;
  /** Beside the title, such as the forecast's method. */
  badge?: ReactNode;
  link: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="card card-body">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <CardTitle id={id} title={title} caption={caption} />
        {badge}
      </div>
      {children}
      <Link href={link.href} className="inline-flex min-h-[34px] items-center gap-1.5 self-start text-small font-semibold no-underline">
        {link.label}
        <Icon name="chevron" size={14} strokeWidth={2} />
      </Link>
    </section>
  );
}
