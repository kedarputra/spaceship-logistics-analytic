import type { Order } from "./orders";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_PER_DAY = 86_400_000;

/** An inclusive range of calendar dates, as YYYY-MM-DD strings. */
export interface Period {
  from: string;
  to: string;
}

type CalendarUnit = "day" | "week" | "month" | "quarter" | "year";

/** The units a result can be bucketed by over time. */
export type BucketUnit = Extract<CalendarUnit, "day" | "week" | "month">;

/** The units a relative period can be counted in ("last 3 months", "last quarter"). */
export type PeriodUnit = Extract<CalendarUnit, "week" | "month" | "quarter" | "year">;

/**
 * A period as the question names it (ADR 0002 §1). Code resolves it against the data; the
 * model never computes a date.
 */
export type SymbolicPeriod =
  /** "last month": the full unit before the anchor's unit. */
  | { type: "previous"; unit: PeriodUnit }
  /** "last 3 months": N units ending with, and including, the anchor's unit. */
  | { type: "last"; count: number; unit: PeriodUnit }
  /** "this month": the anchor's unit. */
  | { type: "this"; unit: PeriodUnit }
  /** "last 30 days": N days ending on the anchor. */
  | { type: "last_days"; days: number }
  /** "March" or "March 2024" (month 1–12). Without a year: the latest March on or before the anchor. */
  | { type: "month"; month: number; year?: number }
  /** "Q3" or "Q3 2025" (quarter 1–4). Without a year: the latest one on or before the anchor. */
  | { type: "quarter"; quarter: number; year?: number }
  /** Dates copied from the question as written. */
  | { type: "range"; from: string; to: string }
  /** Everything the data covers. */
  | { type: "all" };

/** One day, week or month of a period (ADR 0002 §4). */
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

const MONTHS_PER_UNIT = { month: 1, quarter: 3, year: 12 } as const;

/** The 1st of the month `months` after the month of `date` (negative goes back). */
function addMonths(date: string, months: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, month + months, 1)).toISOString().slice(0, 10);
}

/** The first day of the day, ISO week (its Monday), month, quarter, or year that contains the date. */
function unitStart(date: string, unit: CalendarUnit): string {
  const monthIndex = Number(date.slice(5, 7)) - 1;
  switch (unit) {
    case "day":
      return date;
    case "week":
      return dateOfDay(dayNumber(date) - ((new Date(date).getUTCDay() + 6) % 7));
    case "month":
      return addMonths(date, 0);
    case "quarter":
      return addMonths(date, -(monthIndex % 3));
    case "year":
      return addMonths(date, -monthIndex);
  }
}

/** The start of the unit `count` units after the one starting at `start` (negative goes back). */
function shiftUnits(start: string, unit: CalendarUnit, count: number): string {
  if (unit === "day") return dateOfDay(dayNumber(start) + count);
  if (unit === "week") return dateOfDay(dayNumber(start) + 7 * count);
  return addMonths(start, MONTHS_PER_UNIT[unit] * count);
}

function unitEnd(start: string, unit: CalendarUnit): string {
  return dateOfDay(dayNumber(shiftUnits(start, unit, 1)) - 1);
}

/** "5 Jan" for a day, "w/c 6 Oct" for a week (ADR 0002 §4), "Oct 2025" for a month. */
function unitLabel(start: string, unit: BucketUnit): string {
  const [day, month, year] = formatDate(start).split(" ");
  if (unit === "day") return `${day} ${month}`;
  return unit === "week" ? `w/c ${day} ${month}` : `${month} ${year}`;
}

/** Resolves a symbolic period against the period the data covers, whose end is the anchor (ADR 0002 §3). */
export function resolvePeriod(period: SymbolicPeriod, coverage: Period): Period {
  const anchor = coverage.to;
  // Periods that count back from the anchor stop at it: there is no data after it.
  const upToAnchor = (from: string, unit: CalendarUnit): Period => {
    const end = unitEnd(unitStart(anchor, unit), unit);
    return { from, to: end < anchor ? end : anchor };
  };
  switch (period.type) {
    case "previous": {
      const start = shiftUnits(unitStart(anchor, period.unit), period.unit, -1);
      return { from: start, to: unitEnd(start, period.unit) };
    }
    case "last":
      return upToAnchor(shiftUnits(unitStart(anchor, period.unit), period.unit, 1 - period.count), period.unit);
    case "this":
      return upToAnchor(unitStart(anchor, period.unit), period.unit);
    case "last_days":
      return { from: shiftUnits(anchor, "day", 1 - period.days), to: anchor };
    case "month":
      return namedPeriod(period.month, period.year, "month", anchor);
    case "quarter":
      return namedPeriod(3 * period.quarter - 2, period.year, "quarter", anchor);
    case "range":
      if (period.from > period.to) throw new Error(`The range ${period.from} to ${period.to} ends before it starts`);
      return { from: period.from, to: period.to };
    case "all":
      return coverage;
  }
}

/** The month or quarter starting in `firstMonth` (1–12) of `year`, or of the latest such year on or before the anchor. */
function namedPeriod(firstMonth: number, year: number | undefined, unit: "month" | "quarter", anchor: string): Period {
  const pad = (value: number) => String(value).padStart(2, "0");
  const anchorYear = Number(anchor.slice(0, 4));
  const latestYear = `${anchorYear}-${pad(firstMonth)}-01` <= anchor ? anchorYear : anchorYear - 1;
  const start = `${year ?? latestYear}-${pad(firstMonth)}-01`;
  return { from: start, to: unitEnd(start, unit) };
}

/** The days, weeks or months of a period, in order, each clipped to the period. */
export function buckets(period: Period, unit: BucketUnit): Bucket[] {
  if (period.from > period.to) throw new Error(`The period ${period.from} to ${period.to} ends before it starts`);
  const result: Bucket[] = [];
  for (let start = unitStart(period.from, unit); start <= period.to; start = shiftUnits(start, unit, 1)) {
    const end = unitEnd(start, unit);
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

/**
 * A period as the UI and explanations write it: "1–30 Nov 2025", "1 Oct–31 Dec 2025",
 * "30 Dec 2024–5 Jan 2025", or one date for a single day. Within one year the year can be left
 * off, as in a partial week's note ("1–5 Oct only").
 */
export function formatPeriod({ from, to }: Period, options: { year: boolean } = { year: true }): string {
  const [fromDay, fromMonth] = formatDate(from).split(" ");
  const [toDay, toMonth] = formatDate(to).split(" ");
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatDate(from)}–${formatDate(to)}`;
  const year = options.year ? ` ${from.slice(0, 4)}` : "";
  if (from === to) return `${fromDay} ${fromMonth}${year}`;
  if (from.slice(0, 7) !== to.slice(0, 7)) return `${fromDay} ${fromMonth}–${toDay} ${toMonth}${year}`;
  return `${fromDay}–${toDay} ${toMonth}${year}`;
}

/** "No data for … The data covers …" when the period misses the data entirely (ADR 0002 §6), otherwise null. */
export function noDataMessage(period: Period, coverage: Period): string | null {
  if (period.to >= coverage.from && period.from <= coverage.to) return null;
  return `No data for ${formatPeriod(period)}. The data covers ${formatPeriod(coverage)}.`;
}

/** "2025-12-31" → "31 Dec 2025". Works on the string, so no time zone can shift the day. */
export function formatDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) throw new Error(`Not a YYYY-MM-DD date: "${date}"`);
  return `${Number(match[3])} ${month} ${match[1]}`;
}
