import Link from "next/link";
import { ClassMark } from "@/components/abc-class";
import { ordersLink, ordersNoun, RowLink } from "@/components/card-link";
import { CardTitle } from "@/components/card-title";
import { ChartCard } from "@/components/chart-card";
import { choiceParams, DEFAULT_MONTHS, forecastHref } from "@/components/forecast-scopes";
import { GROSS_VALUE_NOTE } from "@/components/gross-value";
import { Icon } from "@/components/icons";
import { InfoButton } from "@/components/info-button";
import { Legend } from "@/components/legend";
import { PageHeader } from "@/components/page-header";
import { ParetoChart } from "@/components/pareto-chart";
import { Table } from "@/components/text-table";
import { ABC_LIMITS, type AbcClass } from "@/domain/definitions";
import { formatCount, formatPercent, formatUsd } from "@/domain/format";
import { getDataset } from "@/domain/orders";
import { type AbcClassFigures, type Inventory, inventory as inventoryOf } from "@/tools/inventory";
import { countOf } from "@/tools/words";

/** How many SKUs the top table lists. */
const TOP_SKUS = 10;

const RANKING_NOTE = "SKUs are ranked by gross value, highest first; ties by SKU.";

/** Which SKUs a class holds, by the limits of domain/definitions. */
const CLASS_RULES: Record<AbcClass, string> = {
  A: `The SKUs ranked while the value before them is under ${ABC_LIMITS.A}% of all value.`,
  B: `The SKUs ranked while the value before them is from ${ABC_LIMITS.A}% to under ${ABC_LIMITS.B}%.`,
  C: `The SKUs ranked after ${ABC_LIMITS.B}% of all value.`,
};

/** One class: its letter and colour, its SKUs, and its gross value and share of all value. */
function ClassTile({ figures }: { figures: AbcClassFigures }) {
  const { abcClass, skus, value } = figures;
  const label = `Class ${abcClass}`;
  return (
    <li className="card flex flex-col gap-1.5 p-4">
      <div className="flex items-center gap-1">
        <h2 className="text-small">
          <ClassMark abcClass={abcClass}>{label}</ClassMark>
        </h2>
        <InfoButton title={label} lines={[CLASS_RULES[abcClass], RANKING_NOTE, GROSS_VALUE_NOTE]} />
      </div>
      <p className="text-kpi">
        {formatCount(skus.numerator)} <span className="text-unit text-ink-2">{skus.numerator === 1 ? "SKU" : "SKUs"}</span>
      </p>
      <p className="text-small text-muted">{`${formatUsd(value.numerator)} · ${formatPercent(value.value)} of value`}</p>
    </li>
  );
}

/** "The catalogue is flat: 174 of 355 SKUs (49.0%) make 80% of the value." Computed, the adjective too. */
function shapeLine({ shape, classes }: Inventory): string | undefined {
  const a = classes.find(({ abcClass }) => abcClass === "A");
  if (a === undefined || a.skus.denominator === 0) return undefined;
  return `The catalogue is ${shape}: ${formatCount(a.skus.numerator)} of ${formatCount(a.skus.denominator)} SKUs (${formatPercent(a.skus.value)}) make ${ABC_LIMITS.A}% of the value.`;
}

/** The Pareto chart's card: the curve, its legend with each class's letter, and every SKU in its Data table. */
function ParetoCard({ inventory }: { inventory: Inventory }) {
  const points = inventory.skus.map(({ rank, sku, abcClass, grossValue, cumulativeShare }) => ({ rank, sku, abcClass, valueText: formatUsd(grossValue), cumulativeShare }));
  return (
    <ChartCard
      id="pareto-title"
      title="Cumulative share of value"
      info={[`${RANKING_NOTE} The line is the share of all value up to each SKU.`, `The dashed lines are the class limits, ${ABC_LIMITS.A}% and ${ABC_LIMITS.B}%.`, GROSS_VALUE_NOTE]}
      legend={
        <Legend>
          {inventory.classes.map(({ abcClass, skus }) => (
            <li key={abcClass} className="inline-flex items-center gap-1.5">
              <ClassMark abcClass={abcClass} />
              {countOf(skus.numerator, "SKU")}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-3.5 border-t-2 border-dashed border-grey-green" />
            {`Class limits, ${ABC_LIMITS.A}% and ${ABC_LIMITS.B}%`}
          </li>
        </Legend>
      }
      table={{
        headers: ["Rank", "SKU", "Class", "Gross value", "Cumulative share"],
        rows: inventory.skus.map(({ rank, sku, abcClass, grossValue, cumulativeShare }) => [formatCount(rank), sku, abcClass, formatUsd(grossValue), formatPercent(cumulativeShare)]),
      }}
    >
      <ParetoChart points={points} limits={[ABC_LIMITS.A / 100, ABC_LIMITS.B / 100]} />
    </ChartCard>
  );
}

/** The SKUs with the most value, each opening its orders in Raw data. */
function TopSkus({ inventory }: { inventory: Inventory }) {
  return (
    <section aria-labelledby="top-skus-title" className="card card-body">
      <CardTitle id="top-skus-title" title={`Top ${TOP_SKUS} SKUs by value`} info={[RANKING_NOTE, GROSS_VALUE_NOTE]} />
      <Table
        headers={["SKU", "Class", "Category", "Orders", "Units", "Gross value"]}
        rowHeaders
        numericFrom={3}
        sortedBy={5}
        linkedRows
        rows={inventory.skus.slice(0, TOP_SKUS).map((sku) => [
          <RowLink key="sku" name={sku.sku} link={ordersLink(sku.orders, ordersNoun(sku.orders), { sku: [sku.sku] })} />,
          <ClassMark key="class" abcClass={sku.abcClass} />,
          sku.category,
          formatCount(sku.orders),
          formatCount(sku.units),
          formatUsd(sku.grossValue),
        ])}
      />
    </section>
  );
}

/** The product categories by value, each opening its orders in Raw data and its forecast. */
function Categories({ inventory }: { inventory: Inventory }) {
  const { total } = inventory;
  return (
    <section aria-labelledby="categories-title" className="card card-body">
      <CardTitle id="categories-title" title="Categories" info={["By gross value, highest first.", GROSS_VALUE_NOTE]} />
      <Table
        headers={["Category", "Orders", "Units", "Gross value", "Share of value", "Forecast"]}
        rowHeaders
        numericFrom={1}
        sortedBy={3}
        linkedRows
        rows={inventory.categories.map(({ category, figures, share }) => [
          <RowLink key="category" name={category} link={ordersLink(figures.orders, ordersNoun(figures.orders), { category: [category] })} />,
          formatCount(figures.orders),
          formatCount(figures.units),
          formatUsd(figures.grossValue),
          formatPercent(share.value),
          // Above the row's stretched link, so it stays its own link.
          <Link
            key="forecast"
            href={forecastHref(choiceParams({ scope: "category", value: category, months: DEFAULT_MONTHS }))}
            aria-label={`${category}: view the forecast`}
            className="relative z-[1] inline-flex items-center gap-1 font-semibold no-underline"
          >
            Forecast
            <Icon name="arrow" size={13} strokeWidth={2} />
          </Link>,
        ])}
        footer={["All categories", formatCount(total.figures.orders), formatCount(total.figures.units), formatUsd(total.figures.grossValue), formatPercent(total.share.value), ""]}
      />
    </section>
  );
}

/**
 * Inventory (ticket 33): the SKUs in ABC classes by gross value, the Pareto curve, the top SKUs and the
 * categories. Every figure comes from domain/definitions through tools/inventory (ADR 0011 §6). SKUs and
 * categories open their orders in Raw data, and categories their forecast.
 */
export function InventoryPage() {
  const { orders, anchor } = getDataset();
  const inventory = inventoryOf(orders);
  const shape = shapeLine(inventory);
  return (
    <>
      <PageHeader label="Inventory" title="Inventory" asOf={anchor} />
      <section aria-label="ABC classes" className="flex flex-col gap-2.5">
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
          {inventory.classes.map((classFigures) => (
            <ClassTile key={classFigures.abcClass} figures={classFigures} />
          ))}
        </ul>
        {shape === undefined ? null : <p className="text-small text-ink-2">{shape}</p>}
      </section>
      <ParetoCard inventory={inventory} />
      <TopSkus inventory={inventory} />
      <Categories inventory={inventory} />
    </>
  );
}
