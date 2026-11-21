import Link from "next/link";
import { CardTitle } from "@/components/card-title";
import { DataFilters } from "@/components/data-filters";
import { Icon } from "@/components/icons";
import { OrdersTable } from "@/components/orders-table";
import { DATA_PAGE_PATH, ordersHref } from "@/components/orders-href";
import {
  clearAllHref,
  csvHref,
  dataMonths,
  type FilterChip,
  filterChips,
  filterLists,
  filterQuery,
  type IgnoredParameter,
  readOrdersView,
  type SearchParams,
} from "@/components/orders-url";
import { PageHeader } from "@/components/page-header";
import { type DashboardKpis, dashboardKpis } from "@/domain/definitions";
import { formatCount, formatDays, formatFraction, formatPercent } from "@/domain/format";
import { DATASET_FILE, getDataset } from "@/domain/orders";
import { type OrdersPage, type OrdersView, ordersInView, pageOf } from "@/tools/orders-view";

/** Each active filter as a chip that removes it, then Clear all. */
function ActiveFilters({ chips, clearHref }: { chips: FilterChip[]; clearHref: string }) {
  return (
    <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.href}>
          <Link href={chip.href} scroll={false} aria-label={`Remove ${chip.label}`} className="chip gap-1.5 py-1 no-underline">
            {chip.label}
            <span aria-hidden="true" className="text-muted">
              ×
            </span>
          </Link>
        </li>
      ))}
      <li>
        <Link href={clearHref} scroll={false} className="text-small font-semibold">
          Clear all
        </Link>
      </li>
    </ul>
  );
}

/** What the URL asked for that the page left out, and why. */
function IgnoredNote({ ignored }: { ignored: IgnoredParameter[] }) {
  return (
    <div role="note" aria-label="Not applied" className="flex flex-col gap-1 rounded-inset border border-warn-line bg-warn-tint px-3.5 py-2.5 text-small text-warn-ink">
      <p className="font-semibold">Left out of this view:</p>
      <ul className="flex flex-col gap-0.5">
        {ignored.map(({ parameter, reason }) => (
          <li key={parameter}>
            <code className="font-mono">{parameter}</code>
            {`: ${reason}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The orders shown, summed up by the KPI definitions and their formats: no new arithmetic (ADR 0011 §6).
 * Under a status filter the rates only restate it (delayed orders are 100% delayed), which a question's
 * spec refuses to measure (ADR 0006), so the summary says so.
 */
function Summary({ kpis, total, statusFiltered }: { kpis: DashboardKpis; total: number; statusFiltered: boolean }) {
  const { totalOrders, deliveredOrders, onTimeRate, delayedOrders, averageDeliveryDays } = kpis;
  const figures = [
    { term: "Orders", value: formatCount(totalOrders.count), detail: `of ${formatCount(total)}` },
    { term: "Delivered", value: formatCount(deliveredOrders.count), detail: `${formatCount(totalOrders.notDelivered)} not delivered` },
    { term: "On-time rate", value: formatPercent(onTimeRate.value), detail: formatFraction(onTimeRate) },
    { term: "Delay rate", value: formatPercent(delayedOrders.delayRate.value), detail: formatFraction(delayedOrders.delayRate) },
    { term: "Average delivery time", value: formatDays(averageDeliveryDays.value), detail: `over ${formatCount(deliveredOrders.count)} delivered` },
  ];
  return (
    <section aria-label="Summary" className="flex flex-col gap-2">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,128px),1fr))] gap-3">
        {figures.map(({ term, value, detail }) => (
          <div key={term} className="card flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-small font-semibold text-ink-2">{term}</dt>
            <dd className="text-figure">{value}</dd>
            <dd className="text-note text-muted">{detail}</dd>
          </div>
        ))}
      </dl>
      {statusFiltered ? <p className="text-note text-muted">The rates count only the statuses chosen, so the status filter decides them.</p> : null}
    </section>
  );
}

/** "51–100 of 400". */
function rowsShown(page: OrdersPage): string {
  return `${formatCount(page.first)}–${formatCount(page.last)} of ${formatCount(page.total)}`;
}

/** Previous or Next: a link to that page, or the same words greyed out at either end. */
function PageLink({ view, page, children }: { view: OrdersView; page: number | undefined; children: string }) {
  if (page === undefined) {
    return (
      <span aria-disabled="true" className="button-small cursor-default opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link href={ordersHref({ ...view, page })} scroll={false} className="button-small no-underline">
      {children}
    </Link>
  );
}

/** Previous, the rows shown, and Next. */
function Paging({ page, view }: { page: OrdersPage; view: OrdersView }) {
  return (
    <nav aria-label="Pages of orders" className="flex items-center justify-between gap-3 text-small text-ink-2">
      <PageLink view={view} page={page.page > 1 ? page.page - 1 : undefined}>
        Previous
      </PageLink>
      <span>{rowsShown(page)}</span>
      <PageLink view={view} page={page.page < page.pages ? page.page + 1 : undefined}>
        Next
      </PageLink>
    </nav>
  );
}

function rowsCaption(page: OrdersPage, view: OrdersView): string {
  if (page.total === 0) return "No orders";
  return `${rowsShown(page)} · ${view.sort === undefined ? "in file order" : "sorted by the marked column"}`;
}

/**
 * Raw data (ticket 28): the orders of the file as they are, read-only, with the filters of the query
 * spec, a sort, pages of 50, a summary and a CSV. Every view is a URL. The rows are picked by the
 * query tool's own matching and summed up by the KPI definitions (ADR 0011 §5–6).
 */
export default async function DataPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { orders } = getDataset();
  const { view, ignored } = readOrdersView(await searchParams, orders);
  const inView = ordersInView(orders, view);
  const page = pageOf(inView, view.page);
  const chips = filterChips(view);

  return (
    <>
      <PageHeader
        label="Data"
        title="Raw data"
        description={`The ${formatCount(orders.length)} orders of ${DATASET_FILE} as the file has them. Read-only: filter, sort and download them.`}
      />
      <section aria-label="Filters" className="card flex flex-col gap-3 p-3.5">
        <DataFilters path={DATA_PAGE_PATH} query={filterQuery(view)} lists={filterLists()} months={dataMonths(orders)} />
        {chips.length === 0 ? null : <ActiveFilters chips={chips} clearHref={clearAllHref(view)} />}
      </section>
      {ignored.length === 0 ? null : <IgnoredNote ignored={ignored} />}
      <Summary kpis={dashboardKpis(inView)} total={orders.length} statusFiltered={view.filters.status !== undefined} />
      <section aria-labelledby="orders-title" className="card card-body">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle id="orders-title" title="Orders" caption={rowsCaption(page, view)} />
          <a href={csvHref(view)} download className="button-small gap-1.5 no-underline">
            <Icon name="download" size={15} />
            Download CSV
          </a>
        </div>
        {page.total === 0 ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-inset border border-grid bg-inset px-4 py-6 text-ink-2">
            No orders match these filters.
            <Link href={clearAllHref(view)} scroll={false} className="font-semibold">
              Clear all
            </Link>
          </p>
        ) : (
          <OrdersTable rows={page.rows} view={view} />
        )}
        {/* No orders is one page, so an empty view has no paging. */}
        {page.pages > 1 ? <Paging page={page} view={view} /> : null}
      </section>
    </>
  );
}
