import { type CardLink, ordersLink, ordersNoun, RowLink } from "@/components/card-link";
import { CardTitle } from "@/components/card-title";
import { GROSS_VALUE_NOTE } from "@/components/gross-value";
import { Icon } from "@/components/icons";
import type { FilterValues } from "@/components/orders-href";
import type { SearchParams } from "@/components/orders-url";
import { PageHeader } from "@/components/page-header";
import { SCORECARD_HEADERS, scorecardCells } from "@/components/scorecard-cells";
import { Tag } from "@/components/tag";
import { Table } from "@/components/text-table";
import { type GroupFigures, SMALL_SAMPLE_MIN_DELIVERED } from "@/domain/definitions";
import { formatCount, formatDays, formatPercent, formatUsd } from "@/domain/format";
import { getDataset, type Order } from "@/domain/orders";
import {
  clientRows,
  DEFAULT_SCORECARD_SORT,
  type Lanes as LaneFigures,
  lanes as laneFigures,
  SCORECARD_COLUMNS,
  type ScorecardColumn,
  type ScorecardSort,
  type Scorecard,
  warehouseScorecard,
} from "@/tools/network";

const NETWORK_PATH = "/network";

const RATES_NOTE = "Rates and the average delivery time are over delivered orders.";

function isScorecardColumn(value: string | undefined): value is ScorecardColumn {
  return SCORECARD_COLUMNS.some((column) => column === value);
}

/** The scorecard's sort in `?sort=order_count&dir=asc`: the default, highest on-time rate first, for anything else. */
export function readScorecardSort(params: SearchParams): ScorecardSort {
  const [sort, dir] = [params.sort, params.dir].map((value) => (Array.isArray(value) ? value[0] : value));
  if (!isScorecardColumn(sort)) return DEFAULT_SCORECARD_SORT;
  return { column: sort, direction: dir === "asc" || dir === "desc" ? dir : firstDirection(sort) };
}

/** A column's first sort: names A to Z, figures highest first. */
function firstDirection(column: ScorecardColumn): ScorecardSort["direction"] {
  return column === "warehouse" ? "asc" : "desc";
}

/** A heading's link: sort by its column, or reverse it when it already is. The default order is the plain page. */
export function scorecardSortHref(current: ScorecardSort, column: ScorecardColumn): string {
  const direction = current.column === column ? (current.direction === "asc" ? "desc" : "asc") : firstDirection(column);
  if (column === DEFAULT_SCORECARD_SORT.column && direction === DEFAULT_SCORECARD_SORT.direction) return NETWORK_PATH;
  return `${NETWORK_PATH}?${new URLSearchParams({ sort: column, dir: direction }).toString()}`;
}

/** A group's orders in Raw data, "View the 15 orders", or none for none. */
function groupOrders(figures: GroupFigures, filters: FilterValues): CardLink | undefined {
  return ordersLink(figures.orders, ordersNoun(figures.orders), filters);
}

/** "best on time" or "worst on time", with an icon: never colour alone. */
function RateMark({ kind }: { kind: "best" | "worst" }) {
  const style = kind === "best" ? "bg-ok-tint text-green-text" : "bg-warn-tint text-warn-ink";
  return (
    <span className={`pill ml-1.5 h-5 gap-1 px-1.5 ${style}`}>
      <Icon name={kind === "best" ? "check" : "alert"} size={12} strokeWidth={2.2} />
      {`${kind} on time`}
    </span>
  );
}

function SmallSample({ figures }: { figures: GroupFigures }) {
  return figures.smallSample ? (
    <span className="ml-1.5">
      <Tag tone="warn">small sample</Tag>
    </span>
  ) : null;
}

/**
 * One row per warehouse, sortable by any heading, the highest on-time rate first by default. The best and
 * worst on time are marked; each row opens the warehouse's orders in Raw data.
 */
function WarehouseScorecard({ scorecard, sort }: { scorecard: Scorecard; sort: ScorecardSort }) {
  return (
    <section aria-labelledby="warehouses-title" className="card card-body">
      <CardTitle
        id="warehouses-title"
        title="Warehouse scorecard"
        info={[
          RATES_NOTE,
          `Best and worst on time: the highest and the lowest on-time rate among warehouses with at least ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders.`,
          GROSS_VALUE_NOTE,
          "A heading sorts by its column; a second click reverses it.",
        ]}
      />
      <Table
        headers={SCORECARD_COLUMNS.map((column) => SCORECARD_HEADERS[column])}
        rowHeaders
        numericFrom={1}
        sortedBy={SCORECARD_COLUMNS.indexOf(sort.column)}
        sortDirection={sort.direction}
        sortHref={(column) => scorecardSortHref(sort, SCORECARD_COLUMNS[column] ?? DEFAULT_SCORECARD_SORT.column)}
        linkedRows
        rows={scorecard.rows.map(({ warehouse, figures }) => [
          <span key="warehouse">
            <RowLink name={warehouse} link={groupOrders(figures, { warehouse: [warehouse] })} />
            {scorecard.best.includes(warehouse) ? <RateMark kind="best" /> : null}
            {scorecard.worst.includes(warehouse) ? <RateMark kind="worst" /> : null}
            <SmallSample figures={figures} />
          </span>,
          ...scorecardCells(figures),
        ])}
        footer={["All warehouses", ...scorecardCells(scorecard.total)]}
      />
    </section>
  );
}

/** "No lane has 20 delivered orders, so …", or how many lanes are small samples. */
function lanesSampleNote({ rows, smallSamples }: LaneFigures): string {
  if (smallSamples === 0) return `Every lane has at least ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders.`;
  if (smallSamples === rows.length) return `No lane has ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders, so the rates per lane are indicative only.`;
  return `${formatCount(smallSamples)} of ${formatCount(rows.length)} lanes have fewer than ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders: their rates are indicative only.`;
}

/** The lanes from origin to destination, most orders first, each opening its orders in Raw data. */
function Lanes({ orders }: { orders: readonly Order[] }) {
  const figures = laneFigures(orders);
  const lanes = figures.rows;
  return (
    <section aria-labelledby="lanes-title" className="card card-body">
      <CardTitle
        id="lanes-title"
        title="Lanes"
        info={["Origin city → destination city, most orders first.", lanesSampleNote(figures), RATES_NOTE]}
        detail={`${formatCount(lanes.length)} lanes`}
      />
      <Table
        headers={["Lane", "Orders", "Delivered", "On-time rate", "Avg delivery time"]}
        rowHeaders
        numericFrom={1}
        sortedBy={1}
        linkedRows
        rows={lanes.map(({ origin, destination, figures }) => [
          <span key="lane">
            <RowLink name={`${origin} → ${destination}`} link={groupOrders(figures, { origin: [origin], destination: [destination] })} />
            <SmallSample figures={figures} />
          </span>,
          formatCount(figures.orders),
          formatCount(figures.delivered),
          formatPercent(figures.onTimeRate.value),
          formatDays(figures.averageDeliveryDays.value),
        ])}
      />
    </section>
  );
}

/** The clients by gross value, as a 3PL reports per customer, each opening its orders in Raw data. */
function Clients({ orders }: { orders: readonly Order[] }) {
  const clients = clientRows(orders);
  return (
    <section aria-labelledby="clients-title" className="card card-body">
      <CardTitle
        id="clients-title"
        title="Clients"
        info={[
          "By gross value, highest first.",
          GROSS_VALUE_NOTE,
          `${RATES_NOTE} Clients with fewer than ${SMALL_SAMPLE_MIN_DELIVERED} delivered orders are marked small sample.`,
        ]}
        detail={`${formatCount(clients.length)} clients`}
      />
      <Table
        headers={["Client", "Orders", "Units", "Gross value", "Delivered", "On-time rate", "Avg delivery time"]}
        rowHeaders
        numericFrom={1}
        sortedBy={3}
        linkedRows
        rows={clients.map(({ client, figures }) => [
          <span key="client">
            <RowLink name={client} link={groupOrders(figures, { client: [client] })} />
            <SmallSample figures={figures} />
          </span>,
          formatCount(figures.orders),
          formatCount(figures.units),
          formatUsd(figures.grossValue),
          formatCount(figures.delivered),
          formatPercent(figures.onTimeRate.value),
          formatDays(figures.averageDeliveryDays.value),
        ])}
      />
    </section>
  );
}

export interface NetworkPageProps {
  searchParams: Promise<SearchParams>;
}

/**
 * Network (ticket 33): the warehouses as a scorecard, the lanes and the clients. Every figure comes from
 * domain/definitions through tools/network (ADR 0011 §6). Every row opens its orders in Raw data, with the
 * origin, destination and client filters this ticket added there.
 */
export async function NetworkPage({ searchParams }: NetworkPageProps) {
  const { orders, anchor } = getDataset();
  const sort = readScorecardSort(await searchParams);
  return (
    <>
      <PageHeader label="Network" title="Network" asOf={anchor} />
      <WarehouseScorecard scorecard={warehouseScorecard(orders, sort)} sort={sort} />
      <Lanes orders={orders} />
      <Clients orders={orders} />
    </>
  );
}
