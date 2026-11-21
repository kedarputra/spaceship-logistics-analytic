import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { InfoButton } from "@/components/info-button";
import { filteredOrdersHref } from "@/components/orders-href";
import { PageHeader } from "@/components/page-header";
import { Table } from "@/components/text-table";
import { METRICS } from "@/domain/definitions";
import { formatCount } from "@/domain/format";
import type { Dataset } from "@/domain/orders";
import { formatDate } from "@/domain/periods";
import { type AttentionRow, type AttentionSection, type AttentionSectionId, needsAttention, type Worklist } from "@/tools/attention";
import { countOf } from "@/tools/words";

/** How many orders each section's table shows; "View all" opens the rest in Raw data. */
const ROWS_SHOWN = 10;

const OLDEST_FIRST = "Oldest first, by order date.";

interface Column {
  heading: string;
  /** Right-aligned. */
  numeric?: boolean;
  cell: (row: AttentionRow) => ReactNode;
}

/** Days as a table cell shows them; an empty cell for none. */
function dayCell(value: number | null): string {
  return value === null ? "" : formatCount(value);
}

/** The columns every section shows: who, which carrier and warehouse, and when it was ordered. */
const ORDER_COLUMNS: readonly Column[] = [
  { heading: "Order ID", cell: ({ order }) => order.order_id },
  { heading: "Client", cell: ({ order }) => order.client_id },
  { heading: "Carrier", cell: ({ order }) => order.carrier },
  { heading: "Warehouse", cell: ({ order }) => order.warehouse },
  { heading: "Order date", cell: ({ order }) => formatDate(order.order_date) },
];

const DELIVERED_COLUMNS: readonly Column[] = [
  { heading: "Delivery date", cell: ({ order }) => (order.delivery_date === null ? "" : formatDate(order.delivery_date)) },
  { heading: "Delivery days", numeric: true, cell: ({ deliveryDays }) => dayCell(deliveryDays) },
];

/** What each section is called, what it shows past the order columns, and what its info popover says. */
const SECTION_WORDS: Record<
  AttentionSectionId,
  { title: string; columns: readonly Column[]; viewAll: (count: number) => string; info: (worklist: Worklist, anchor: string) => string[] }
> = {
  overdue: {
    title: "Overdue in transit",
    columns: [{ heading: "Days in transit", numeric: true, cell: ({ transitAge }) => dayCell(transitAge) }],
    viewAll: (count) => `View all ${formatCount(count)} in transit`,
    info: ({ longestCompletedDelivery }, anchor) => [
      longestCompletedDelivery === null
        ? "No order has been delivered yet, so none in transit can be compared with a delivery."
        : `In transit longer than the longest completed delivery, ${countOf(longestCompletedDelivery, "day")}: older than any order that ever arrived. The data has no promised date, so this is the threshold.`,
      `Days in transit: from the order date to ${formatDate(anchor)}.`,
      OLDEST_FIRST,
    ],
  },
  exceptions: {
    title: "Exceptions",
    columns: DELIVERED_COLUMNS,
    viewAll: (count) => `View all ${countOf(count, "exception")}`,
    info: () => [METRICS.exception_orders.definition, OLDEST_FIRST],
  },
  delayed: {
    title: "Delayed",
    columns: DELIVERED_COLUMNS,
    viewAll: (count) => `View all ${formatCount(count)} delayed`,
    info: () => [METRICS.delayed_orders.definition, OLDEST_FIRST],
  },
  canceled: {
    title: "Canceled",
    columns: [],
    viewAll: (count) => `View all ${formatCount(count)} canceled`,
    info: () => ["Orders with status canceled: never delivered.", OLDEST_FIRST],
  },
};

/** The orders in transit by age as small tiles, and how many more are in transit but not overdue. */
function InTransitAges({ worklist }: { worklist: Worklist }) {
  const within = worklist.withinThreshold.length;
  const threshold = worklist.longestCompletedDelivery;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-muted uppercase">Days in transit</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {worklist.buckets.map(({ label, count }) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-inset border border-line bg-inset px-3 py-2">
            <dt className="text-note text-muted">{`${label} days`}</dt>
            <dd className="text-figure">{formatCount(count)}</dd>
          </div>
        ))}
      </dl>
      {within === 0 ? null : (
        <p className="text-small text-ink-2">
          {threshold === null ? `${formatCount(within)} in transit` : `${formatCount(within)} more in transit, within ${countOf(threshold, "day")}`}
        </p>
      )}
    </div>
  );
}

/** A section's count per carrier, most first: whom to call. */
function ByCarrier({ section }: { section: AttentionSection }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label text-muted uppercase">By carrier</p>
      <ul className="flex flex-wrap gap-1.5">
        {section.byCarrier.map(({ carrier, count }) => (
          <li key={carrier} className="rounded-full bg-track px-2.5 py-0.5 text-caption text-ink-2">
            {carrier} <span className="font-bold text-ink">{formatCount(count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One section: its title, which opens its orders in Raw data oldest first, its count, its count per
 * carrier, and its first orders. Raw data has no filter for overdue, so the overdue section opens every
 * order in transit and says so: the one or few within the threshold are the youngest and come last.
 */
function SectionCard({ section, worklist, anchor }: { section: AttentionSection; worklist: Worklist; anchor: string }) {
  const words = SECTION_WORDS[section.id];
  const count = section.rows.length;
  const overdue = section.id === "overdue";
  // An empty section links nowhere (ADR 0011 §5): its linked count is 0.
  const href = section.linkedOrderCount === 0 ? undefined : filteredOrdersHref({ status: [section.status] }, { column: "order_date", direction: "asc" });
  const columns = [...ORDER_COLUMNS, ...words.columns];
  const firstNumeric = columns.findIndex(({ numeric }) => numeric === true);
  const titleId = `${section.id}-title`;

  return (
    <section aria-labelledby={titleId} className="card card-body">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-1">
          <h2 id={titleId} className="text-card-title">
            {href === undefined ? (
              words.title
            ) : (
              <Link href={href} className="text-ink underline decoration-field underline-offset-4 hover:text-ink hover:decoration-ink">
                {words.title}
              </Link>
            )}
          </h2>
          <InfoButton title={words.title} lines={words.info(worklist, anchor)} />
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-figure">{formatCount(count)}</span>
          {overdue ? <span className="text-small text-muted">{`of ${formatCount(worklist.inTransit)} in transit`}</span> : null}
        </p>
      </div>
      {overdue ? <InTransitAges worklist={worklist} /> : null}
      {count === 0 ? (
        <p className="rounded-inset border border-grid bg-inset px-4 py-3 text-small text-ink-2">None.</p>
      ) : (
        <>
          <ByCarrier section={section} />
          <Table
            headers={columns.map(({ heading }) => heading)}
            rows={section.rows.slice(0, ROWS_SHOWN).map((row) => columns.map(({ cell }) => cell(row)))}
            rowHeaders
            noWrap
            numericFrom={firstNumeric === -1 ? undefined : firstNumeric}
          />
        </>
      )}
      {href === undefined ? null : (
        <Link href={href} className="inline-flex items-center gap-1 self-start text-small font-semibold no-underline">
          {words.viewAll(section.linkedOrderCount)}
          <Icon name="arrow" size={14} strokeWidth={2} />
        </Link>
      )}
    </section>
  );
}

/**
 * Needs attention (ticket 32): the orders someone should act on, oldest first, the way a WMS exception
 * queue lists them. Overdue in transit, exceptions, delayed and canceled, each with its count, its count
 * per carrier and its first 10 orders; each opens all of them in Raw data. Every figure comes from
 * domain/definitions through the worklist tool (ADR 0011 §6).
 */
export function AttentionPage({ dataset }: { dataset: Dataset }) {
  const worklist = needsAttention(dataset);
  return (
    <>
      <PageHeader label="Worklist" title="Needs attention" asOf={dataset.anchor} />
      {worklist.sections.map((section) => (
        <SectionCard key={section.id} section={section} worklist={worklist} anchor={dataset.anchor} />
      ))}
    </>
  );
}
