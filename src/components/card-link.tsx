import Link from "next/link";
import type { ReactNode } from "react";
import { formatCount } from "@/domain/format";
import type { DateBasis, OrdersView } from "@/tools/orders-view";
import { lowered } from "@/tools/words";
import { Icon } from "./icons";
import { type FilterValues, filteredOrdersHref, monthOrdersHref } from "./orders-href";

/**
 * Cards, bars and table rows that open what explains them (ticket 29): the orders behind a count in
 * Raw data, or the page that breaks a rate down. A link never holds another link or a button.
 */

/** Where a link leads, and the words that say so: "View the 55 orders". */
export interface CardLink {
  href: string;
  text: string;
}

/**
 * `count` orders at `href`, "View the 55 delayed orders"; no link when there are none, so nothing
 * opens an empty view (ticket 26).
 */
export function countLink(count: number, words: string, href: string): CardLink | undefined {
  return count === 0 ? undefined : { href, text: `View the ${formatCount(count)} ${words}` };
}

/** Orders in Raw data: the filters' orders, as many as `count` says; none when it is 0. */
export function ordersLink(count: number, words: string, filters: FilterValues, sort?: OrdersView["sort"]): CardLink | undefined {
  return countLink(count, words, filteredOrdersHref(filters, sort));
}

/** One month's orders in Raw data by order or delivery date, as many as `count` says; none when it is 0. */
export function monthOrdersLink(count: number, words: string, monthStart: string, basis: DateBasis, filters: FilterValues = {}): CardLink | undefined {
  return countLink(count, words, monthOrdersHref(monthStart, basis, filters));
}

/** "Delayed orders: view the 55 orders": what the link is on, then what it opens. */
function linkName(name: string, link: CardLink): string {
  return `${name}: ${lowered(link.text)}`;
}

/**
 * A card's box. With a link, the whole card is that link and one tab stop: its border turns sage and
 * an arrow appears on hover and focus, and a line at its foot says what opens, so it is found on touch.
 * `name` is what the card shows, such as its label.
 */
export function CardBox({ name, link, className, children }: { name: string; link?: CardLink; className: string; children: ReactNode }) {
  if (link === undefined) return <div className={`h-full ${className}`}>{children}</div>;
  return (
    <Link
      href={link.href}
      aria-label={linkName(name, link)}
      className={`group h-full text-ink no-underline transition-[border-color] hover:border-sage hover:text-ink focus-visible:border-sage ${className}`}
    >
      {children}
      <span className="mt-auto flex items-center gap-1 pt-1 text-small font-semibold text-green-text">
        {link.text}
        <Icon name="arrow" size={14} strokeWidth={2} className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </span>
    </Link>
  );
}

/**
 * A bar's or a table row's name as its link. The link stretches over the row, which must be
 * `relative`, so the whole row is its hit target. Without a link, the name alone.
 */
export function RowLink({ name, link }: { name: string; link: CardLink | undefined }) {
  if (link === undefined) return <span className="font-semibold">{name}</span>;
  return (
    <Link href={link.href} aria-label={linkName(name, link)} className="font-semibold text-ink no-underline after:absolute after:inset-0 hover:underline">
      {name}
    </Link>
  );
}
