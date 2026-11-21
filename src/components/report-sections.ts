import type { DeliveryOutcomes, GroupFigures, Ratio } from "@/domain/definitions";
import { type ChangeUnit, formatChange, formatCount, formatDays, formatOf, formatPercent, formatUsd } from "@/domain/format";
import { formatDate, formatMonths, formatPeriod } from "@/domain/periods";
import { type MonthChanges, type MonthFigures, type MonthlyReport, TOP_ROWS } from "@/tools/report";
import { STATUS_LABELS } from "@/tools/words";
import { GROSS_VALUE_NOTE } from "./gross-value";
import { SCORECARD_HEADERS, scorecardCells } from "./scorecard-cells";

/**
 * What the monthly report says (ticket 34), as text: the Reports page and the PDF both draw these
 * sections, so they cannot disagree. The figures are the report's (tools/report); this only formats
 * them, as ADR 0001 §7 shows numbers everywhere else.
 */

export type SectionId = "placed" | "completed" | "outcomes" | "carriers" | "warehouses" | "categories" | "skus" | "attention";

export interface ReportTable {
  headers: string[];
  rows: string[][];
  /** The columns from this one on hold numbers. */
  numericFrom: number;
  footer?: string[];
  /** For each row, whether it is a small sample (ADR 0001 §6): tagged beside its name. */
  smallSample?: boolean[];
}

export interface ReportSection {
  id: SectionId;
  title: string;
  /** The period and the date the figures read, stated once (ADR 0002 §5): "Nov 2025 · by delivery date". */
  basis: string;
  /** What the page's info popover says (ticket 30). */
  info: string[];
  table: ReportTable;
  /** What to say instead of an empty table. */
  empty: string;
}

/** "2025-11" → "Nov 2025". */
export function monthLabel(month: string): string {
  return formatMonths(`${month}-01`, `${month}-01`);
}

const RATES_NOTE = "Rates and the average delivery time are over delivered orders.";
const SMALL_SAMPLE_NOTE = "Fewer than 20 delivered orders are marked small sample.";

/** A rate as the summary shows it: "84.2% · 16 of 19". */
function rateWithParts(rate: Ratio): string {
  return rate.value === null ? formatPercent(null) : `${formatPercent(rate.value)} · ${formatOf(rate)}`;
}

interface SummaryLine {
  label: string;
  value: (figures: GroupFigures) => string;
  change: (changes: MonthChanges) => number | null;
  unit: ChangeUnit;
}

const PLACED_LINES: readonly SummaryLine[] = [
  { label: "Orders", value: (figures) => formatCount(figures.orders), change: (changes) => changes.orders, unit: "orders" },
  { label: "Units", value: (figures) => formatCount(figures.units), change: (changes) => changes.units, unit: "units" },
  { label: "Gross value", value: (figures) => formatUsd(figures.grossValue), change: (changes) => changes.grossValue, unit: "USD" },
];

const COMPLETED_LINES: readonly SummaryLine[] = [
  { label: "Delivered orders", value: (figures) => formatCount(figures.delivered), change: (changes) => changes.delivered, unit: "orders" },
  { label: "On-time rate", value: (figures) => rateWithParts(figures.onTimeRate), change: (changes) => changes.onTimeRate, unit: "points" },
  { label: "Delay rate", value: (figures) => rateWithParts(figures.delayRate), change: (changes) => changes.delayRate, unit: "points" },
  { label: "Avg delivery time", value: (figures) => formatDays(figures.averageDeliveryDays.value), change: (changes) => changes.averageDeliveryDays, unit: "days" },
];

/** A summary table: each figure this month, and with a month before, its figure then and the change. */
function summaryTable({ current, previous, changes }: MonthlyReport, lines: readonly SummaryLine[]): ReportTable {
  const compared = previous !== null && changes !== null;
  return {
    headers: ["Figure", monthLabel(current.month), ...(compared ? [monthLabel(previous.month), "Change"] : [])],
    rows: lines.map(({ label, value, change, unit }) => [
      label,
      value(current.figures),
      ...(compared ? [value(previous.figures), formatChange(change(changes), unit)] : []),
    ]),
    numericFrom: 1,
  };
}

const OUTCOMES: readonly { key: keyof DeliveryOutcomes; label: string }[] = [
  { key: "onTime", label: "On time" },
  { key: "delayed", label: "Delayed" },
  { key: "exception", label: "Exception" },
];

function outcomesTable({ current, previous }: MonthlyReport): ReportTable {
  return {
    headers: ["Outcome", "Orders", "Rate", ...(previous === null ? [] : [monthLabel(previous.month)])],
    rows: OUTCOMES.map(({ key, label }) => [
      label,
      formatCount(current.outcomes[key]),
      formatPercent(current.outcomeRates[key].value),
      ...(previous === null ? [] : [formatCount(previous.outcomes[key])]),
    ]),
    numericFrom: 1,
  };
}

function carriersTable({ carriers }: MonthFigures): ReportTable {
  return {
    headers: ["Carrier", "Delivered", "On time", "Delayed", "On-time rate"],
    rows: carriers.map(({ carrier, figures }) => [
      carrier,
      formatCount(figures.delivered),
      formatCount(figures.onTimeRate.numerator),
      formatCount(figures.delayRate.numerator),
      formatPercent(figures.onTimeRate.value),
    ]),
    numericFrom: 1,
    smallSample: carriers.map(({ figures }) => figures.smallSample),
  };
}

function warehousesTable({ warehouses }: MonthFigures): ReportTable {
  return {
    headers: Object.values(SCORECARD_HEADERS),
    rows: warehouses.rows.map(({ warehouse, figures }) => [warehouse, ...scorecardCells(figures)]),
    numericFrom: 1,
    footer: ["All warehouses", ...scorecardCells(warehouses.total)],
    smallSample: warehouses.rows.map(({ figures }) => figures.smallSample),
  };
}

function categoriesTable({ topCategories }: MonthFigures): ReportTable {
  return {
    headers: ["Category", "Orders", "Units", "Gross value", "Share"],
    rows: topCategories.map(({ category, figures, share }) => [category, formatCount(figures.orders), formatCount(figures.units), formatUsd(figures.grossValue), formatPercent(share.value)]),
    numericFrom: 1,
  };
}

function skusTable({ topSkus }: MonthFigures): ReportTable {
  return {
    headers: ["SKU", "Category", "Orders", "Units", "Gross value"],
    rows: topSkus.map((sku) => [sku.sku, sku.category, formatCount(sku.orders), formatCount(sku.units), formatUsd(sku.grossValue)]),
    numericFrom: 2,
  };
}

function attentionTable({ attention }: MonthFigures): ReportTable {
  return {
    headers: ["Order", "Ordered", "Carrier", "Warehouse", "Status", "Days in transit"],
    rows: attention.map(({ order, transitAge }) => [
      order.order_id,
      formatDate(order.order_date),
      order.carrier,
      order.warehouse,
      STATUS_LABELS[order.status] ?? order.status,
      transitAge === null ? "" : formatCount(transitAge),
    ]),
    numericFrom: 5,
  };
}

/** The report's sections, in order: the summary in two, the outcomes, carriers, warehouses, top categories and SKUs, and what needs attention. */
export function reportSections(report: MonthlyReport): ReportSection[] {
  const { current, anchor } = report;
  const month = monthLabel(current.month);
  const dates = formatPeriod(current.period);
  const byOrderDate = `${month} · by order date`;
  const byDeliveryDate = `${month} · by delivery date`;
  return [
    {
      id: "placed",
      title: "Orders placed",
      basis: byOrderDate,
      info: [`Orders with an order date in ${dates}, whatever their status now.`, GROSS_VALUE_NOTE],
      table: summaryTable(report, PLACED_LINES),
      empty: `No orders were placed in ${month}.`,
    },
    {
      id: "completed",
      title: "Deliveries completed",
      basis: byDeliveryDate,
      info: [`Orders with a delivery date in ${dates}: on time, delayed or exception.`, "On-time rate: on-time deliveries ÷ delivered orders. Delay rate: delayed ÷ delivered.", "A rate's change is in percentage points."],
      table: summaryTable(report, COMPLETED_LINES),
      empty: `No deliveries were completed in ${month}.`,
    },
    {
      id: "outcomes",
      title: "Delivery outcomes",
      basis: byDeliveryDate,
      info: [
        "Each delivered order has one outcome; an exception is neither on time nor delayed.",
        "Rate: the outcome's orders ÷ the deliveries completed in the month, as the on-time and delay rates are.",
        reportWeeks(report).note,
      ],
      table: outcomesTable(report),
      empty: `No deliveries were completed in ${month}.`,
    },
    {
      id: "carriers",
      title: "Carriers",
      basis: byDeliveryDate,
      info: ["Most deliveries first.", RATES_NOTE, SMALL_SAMPLE_NOTE],
      table: carriersTable(current),
      empty: `No deliveries were completed in ${month}.`,
    },
    {
      id: "warehouses",
      title: "Warehouse scorecard",
      basis: `${month} · orders by order date, deliveries by delivery date`,
      info: ["Network's scorecard for the month, highest on-time rate first.", RATES_NOTE, SMALL_SAMPLE_NOTE, GROSS_VALUE_NOTE],
      table: warehousesTable(current),
      empty: `No orders were placed or delivered in ${month}.`,
    },
    {
      id: "categories",
      title: "Top categories",
      basis: byOrderDate,
      info: [`The ${TOP_ROWS} categories with the most gross value. Share: of the month's gross value.`, GROSS_VALUE_NOTE],
      table: categoriesTable(current),
      empty: `No orders were placed in ${month}.`,
    },
    {
      id: "skus",
      title: "Top SKUs",
      basis: byOrderDate,
      info: [`The ${TOP_ROWS} SKUs with the most gross value.`, GROSS_VALUE_NOTE],
      table: skusTable(current),
      empty: `No orders were placed in ${month}.`,
    },
    {
      id: "attention",
      title: "Needs attention",
      basis: `Placed in ${month} · still in transit on ${formatDate(anchor)}, or canceled`,
      info: [
        `Status is as of ${formatDate(anchor)}, the data's last day: the data cannot say what was in transit at the end of ${month}.`,
        `Days in transit: from the order date to ${formatDate(anchor)}.`,
      ],
      table: attentionTable(current),
      empty: `No order placed in ${month} is still in transit or canceled.`,
    },
  ];
}

/** A week of the outcomes chart: its name, its outcomes, and its delivered orders, the bar's total. */
export interface WeekBar {
  label: string;
  values: DeliveryOutcomes;
  delivered: number;
}

/** The weeks of the month for the outcomes chart, and a note naming the weeks the month cuts short (ADR 0002 §4). */
export function reportWeeks({ current }: MonthlyReport): { bars: WeekBar[]; note: string } {
  const partial = current.weeks.filter(({ bucket }) => bucket.partial).map(({ bucket }) => `${bucket.label}: ${formatPeriod(bucket, { year: false })} only.`);
  return {
    bars: current.weeks.map(({ bucket, value, delivered }) => ({ label: bucket.label, values: value, delivered })),
    note: ["Weeks run Monday to Sunday.", ...partial].join(" "),
  };
}
