"use client";

import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { Icon } from "./icons";

/** A value a field offers, and its words: a carrier, a status, a month ("2025-03", "Mar 2025"). */
export interface Option {
  value: string;
  label: string;
}

/** One list filter of the form: its URL name, its label and its values. */
export interface FilterList {
  name: string;
  label: string;
  options: Option[];
}

/** Menus with one name open one at a time. */
const MENU_GROUP = "orders-filter";

/** The form as a short query: empty fields, which are the defaults, left out. */
function formQuery(form: HTMLFormElement): string {
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string" && value.trim() !== "") params.append(name, value.trim());
  }
  return params.toString();
}

/** One filter's menu: a button that opens its fields below the filter row. */
function Menu({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <details name={MENU_GROUP} className="group">
      <summary className="button-small cursor-pointer list-none gap-1.5 select-none [&::-webkit-details-marker]:hidden">
        {label}
        {count > 0 ? (
          <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rail px-1 text-label tracking-normal text-panel">
            <span className="sr-only">, chosen: </span>
            {count}
          </span>
        ) : null}
        <Icon name="chevron" size={14} strokeWidth={2} className="rotate-90 text-grey-green group-open:-rotate-90" />
      </summary>
      <fieldset className="absolute inset-x-0 top-full z-20 mt-2 flex flex-wrap gap-x-4 gap-y-2 rounded-inset border border-line bg-panel p-3.5 shadow-raised">
        <legend className="sr-only">{label}</legend>
        {children}
      </fieldset>
    </details>
  );
}

const OPTION = "flex min-h-8 items-center gap-2 text-small text-ink-2";
const CONTROL = "size-4 accent-green-text";
const SELECT = "field h-[34px] px-2.5 text-small";

/**
 * The Raw data filters (ticket 28): a GET form whose fields are named as the URL's parameters, so it
 * works without script. With script, each change applies at once as a client-side navigation to a
 * short URL; the search applies on Enter. The page reads the URL and draws the view.
 */
export function DataFilters({ path, query, lists, months }: { path: string; query: string; lists: FilterList[]; months: Option[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // The fields show the view being navigated to until the page for it arrives.
  const [fieldsQuery, showFields] = useOptimistic(query);
  const fields = new URLSearchParams(fieldsQuery);

  // The search box keeps what is typed until it is applied, and follows the URL when it changes elsewhere.
  const urlSearch = new URLSearchParams(query).get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [seenSearch, setSeenSearch] = useState(urlSearch);
  if (urlSearch !== seenSearch) {
    setSeenSearch(urlSearch);
    setSearch(urlSearch);
  }

  // A click outside an open menu closes it.
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      const target = event.target;
      for (const menu of formRef.current?.querySelectorAll("details[open]") ?? []) {
        if (!(target instanceof Node) || !menu.contains(target)) menu.removeAttribute("open");
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  function apply(form: HTMLFormElement) {
    const next = formQuery(form);
    startTransition(() => {
      showFields(next);
      router.push(next === "" ? path : `${path}?${next}`, { scroll: false });
    });
  }

  // Like a text field's change event: typed text applies when the box is left, as well as on Enter.
  function applyTypedSearch(event: FocusEvent<HTMLInputElement>) {
    const { form } = event.currentTarget;
    if (form !== null && search.trim() !== urlSearch) apply(form);
  }

  function change(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { form } = event.currentTarget;
    if (form !== null) apply(form);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(event.currentTarget);
  }

  // Escape closes the open menu and returns to its button.
  function closeOnEscape(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape") return;
    const menu = event.currentTarget.querySelector("details[open]");
    if (menu === null) return;
    menu.removeAttribute("open");
    menu.querySelector("summary")?.focus();
  }

  const promo = fields.get("promo") ?? "";
  const from = fields.get("from") ?? "";
  const to = fields.get("to") ?? "";
  const sort = fields.get("sort");
  const direction = fields.get("dir");

  return (
    <form
      ref={formRef}
      action={path}
      method="get"
      role="search"
      aria-label="Filter orders"
      onSubmit={submit}
      onKeyDown={closeOnEscape}
      className="relative flex flex-wrap items-center gap-2"
    >
      <div className="flex min-w-0 flex-[1_1_240px] items-center gap-1.5">
        <label htmlFor="orders-search" className="sr-only">
          Search order ID, client, SKU or city
        </label>
        <input
          id="orders-search"
          type="search"
          name="q"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onBlur={applyTypedSearch}
          placeholder="ID, client, SKU or city"
          className="field h-[34px] min-w-0 flex-auto px-3 text-small"
        />
        <button type="submit" className="button-small shrink-0" aria-label="Search">
          <Icon name="search" size={16} />
        </button>
      </div>
      {lists.map((list) => {
        const chosen = fields.getAll(list.name);
        return (
          <Menu key={list.name} label={list.label} count={chosen.length}>
            {list.options.map((option) => (
              <label key={option.value} className={OPTION}>
                <input type="checkbox" name={list.name} value={option.value} checked={chosen.includes(option.value)} onChange={change} className={CONTROL} />
                {option.label}
              </label>
            ))}
          </Menu>
        );
      })}
      <Menu label="Promo" count={promo === "" ? 0 : 1}>
        {[
          { value: "", label: "Any" },
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ].map((option) => (
          <label key={option.value} className={OPTION}>
            <input type="radio" name="promo" value={option.value} checked={promo === option.value} onChange={change} className={CONTROL} />
            {option.label}
          </label>
        ))}
      </Menu>
      <Menu label="Dates" count={from === "" && to === "" ? 0 : 1}>
        <label className={OPTION}>
          By
          <select name="date" value={fields.get("date") ?? ""} onChange={change} className={SELECT}>
            {/* Order date is the default, so it sends nothing. */}
            <option value="">Order date</option>
            <option value="delivery">Delivery date</option>
          </select>
        </label>
        <label className={OPTION}>
          From
          <select name="from" value={from} onChange={change} className={SELECT}>
            <option value="">Start of the data</option>
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
        <label className={OPTION}>
          To
          <select name="to" value={to} onChange={change} className={SELECT}>
            <option value="">End of the data</option>
            {months.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
        </label>
      </Menu>
      {sort === null ? null : <input type="hidden" name="sort" value={sort} />}
      {direction === null ? null : <input type="hidden" name="dir" value={direction} />}
      <noscript>
        <button type="submit" className="button-small">
          Apply filters
        </button>
      </noscript>
    </form>
  );
}
