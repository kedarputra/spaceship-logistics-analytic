import Link from "next/link";
import { countOf } from "@/tools/words";
import { type ForecastSelection, HORIZON_MONTHS, SCOPE_TYPES, type ScopeType, type ScopeValues, selectionParams } from "./forecast-scopes";
import { ScopeValuePicker } from "./scope-value-picker";

const SCOPE_LABELS: Record<ScopeType, string> = { total: "All products", category: "Category", warehouse: "Warehouse", region: "Region" };

const GROUP = "inline-flex flex-wrap rounded-control border border-line bg-panel p-[3px]";
const SEGMENT = "inline-flex min-h-[34px] items-center rounded-small px-3 text-small no-underline";
const CURRENT = "bg-rail font-semibold text-panel hover:text-panel";
const OTHER = "text-ink-2 hover:bg-inset hover:text-ink";

/** The page for a choice: /forecast, or /forecast?scope=category&value=CRAYON&months=6. */
function forecastHref(selection: ForecastSelection, values: ScopeValues): string {
  const query = selectionParams(selection, values).toString();
  return query === "" ? "/forecast" : `/forecast?${query}`;
}

/** One choice of a group, as a link: the current one marked for assistive technology and drawn dark. */
function Segment({ href, current, children }: { href: string; current: boolean; children: string }) {
  return (
    <Link href={href} scroll={false} aria-current={current ? "true" : undefined} className={`${SEGMENT} ${current ? CURRENT : OTHER}`}>
      {children}
    </Link>
  );
}

/**
 * The Forecast page's scope and horizon (ticket 25), as links: each choice is a URL, so it works
 * without script, can be shared, and the page runs the forecast tool for it with no model call.
 */
export function ForecastControls({ selection, values }: { selection: ForecastSelection; values: ScopeValues }) {
  const { scope, value, months } = selection;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Scope" className={GROUP}>
        {SCOPE_TYPES.map((type) => (
          <Segment key={type} href={forecastHref({ scope: type, months }, values)} current={type === scope}>
            {SCOPE_LABELS[type]}
          </Segment>
        ))}
      </div>
      {scope === "total" ? null : <ScopeValuePicker label={SCOPE_LABELS[scope]} selection={{ scope, value, months }} values={values} />}
      <div role="group" aria-label="Horizon" className={GROUP}>
        {HORIZON_MONTHS.map((count) => (
          <Segment key={count} href={forecastHref({ scope, value, months: count }, values)} current={count === months}>
            {countOf(count, "month")}
          </Segment>
        ))}
      </div>
    </div>
  );
}
