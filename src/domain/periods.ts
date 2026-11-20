import type { Order } from "./orders";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_PER_DAY = 86_400_000;

/** An inclusive range of calendar dates, as YYYY-MM-DD strings. */
export interface Period {
  from: string;
  to: string;
}

export type BucketUnit = "week" | "month";

/** One week or month of a period (ADR 0002 §4). */
export interface Bucket {
  /** The first day of the whole unit: the Monday of an ISO week, the 1st of a month. Never a week number. */
  key: string;
  /** "w/c 6 Oct" for a week. */
  label: string;
  /** The part of the unit inside the period. */
  from: string;
  to: string;
  /** True when the period cuts the unit short at either end. */
  partial: boolean;
}

// Whole days since 1970-01-01. Date-only ISO strings parse as UTC midnight, so no time zone shifts a day.
function dayNumber(date: string): number {
  return Date.parse(date) / MS_PER_DAY;
}

function dateOfDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole calendar days from one date to another: 29 Mar → 31 Mar 2025 is 2, clock change or not. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** True when the date falls inside the period; a missing date (no delivery yet) never does. */
export function isInPeriod(date: string | null, period: Period): boolean {
  return date !== null && date >= period.from && date <= period.to;
}

/** The first day of the week (its Monday) or month that contains the date. */
function unitStart(date: string, unit: BucketUnit): string {
  if (unit === "month") return `${date.slice(0, 7)}-01`;
  const daysSinceMonday = (new Date(date).getUTCDay() + 6) % 7;
  return dateOfDay(dayNumber(date) - daysSinceMonday);
}

function nextUnitStart(start: string, unit: BucketUnit): string {
  if (unit === "week") return dateOfDay(dayNumber(start) + 7);
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  // Date.UTC takes a 0-based month, so passing the 1-based month gives the next one, rolling over December.
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** "w/c 6 Oct" for a week (ADR 0002 §4), "Oct 2025" for a month. */
function unitLabel(start: string, unit: BucketUnit): string {
  const [day, month, year] = formatDate(start).split(" ");
  return unit === "week" ? `w/c ${day} ${month}` : `${month} ${year}`;
}

/** The weeks or months of a period, in order, each clipped to the period. */
export function buckets(period: Period, unit: BucketUnit): Bucket[] {
  if (period.from > period.to) throw new Error(`The period ${period.from} to ${period.to} ends before it starts`);
  const result: Bucket[] = [];
  for (let start = unitStart(period.from, unit); start <= period.to; start = nextUnitStart(start, unit)) {
    const end = dateOfDay(dayNumber(nextUnitStart(start, unit)) - 1);
    const from = start < period.from ? period.from : start;
    const to = end > period.to ? period.to : end;
    result.push({ key: start, label: unitLabel(start, unit), from, to, partial: from !== start || to !== end });
  }
  return result;
}

/**
 * Sorts items into the buckets of a period by the date `dateOf` picks. Items with no date or a
 * date outside the period are left out; a bucket with no items is kept, empty.
 */
export function groupByBucket<T>(
  items: readonly T[],
  dateOf: (item: T) => string | null,
  period: Period,
  unit: BucketUnit,
): { bucket: Bucket; items: T[] }[] {
  const groups = buckets(period, unit).map((bucket): { bucket: Bucket; items: T[] } => ({ bucket, items: [] }));
  const byKey = new Map(groups.map((group) => [group.bucket.key, group.items]));
  for (const item of items) {
    const date = dateOf(item);
    if (date === null || !isInPeriod(date, period)) continue;
    byKey.get(unitStart(date, unit))?.push(item);
  }
  return groups;
}

/**
 * The anchor date (ADR 0002): the latest order_date or delivery_date in the data.
 * Relative periods count back from it, and the UI shows it as "Data as of".
 * Dates are YYYY-MM-DD strings, so comparing them as strings compares them as dates.
 */
export function anchorDate(orders: readonly Pick<Order, "order_date" | "delivery_date">[]): string {
  let latest: string | undefined;
  for (const order of orders) {
    for (const date of [order.order_date, order.delivery_date]) {
      if (date !== null && (latest === undefined || date > latest)) latest = date;
    }
  }
  if (latest === undefined) throw new Error("The dataset has no orders, so it has no anchor date");
  return latest;
}

/** The period the data covers (ADR 0002 §6): the earliest order_date or delivery_date to the anchor date. */
export function dataPeriod(orders: readonly Pick<Order, "order_date" | "delivery_date">[]): Period {
  const to = anchorDate(orders);
  let from = to;
  for (const order of orders) {
    for (const date of [order.order_date, order.delivery_date]) {
      if (date !== null && date < from) from = date;
    }
  }
  return { from, to };
}

/** "2025-12-31" → "31 Dec 2025". Works on the string, so no time zone can shift the day. */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) throw new Error(`Not a YYYY-MM-DD date: "${date}"`);
  return `${Number(match[3])} ${month} ${match[1]}`;
}
