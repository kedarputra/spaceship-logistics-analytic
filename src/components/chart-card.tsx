"use client";

import { type ReactNode, useId, useState } from "react";
import { CardTitle } from "./card-title";
import { Table, type TextTable } from "./text-table";

/**
 * A chart's values as a table, behind a "Data table" button (ADR 0011 §3: values never rest on the
 * marks alone). The table is in the page from the start, hidden until asked for.
 */
function useTableToggle(table: TextTable) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const button = (
    <button type="button" aria-expanded={shown} aria-controls={id} onClick={() => setShown(!shown)} className="button-small shrink-0 self-start">
      Data table
    </button>
  );
  const tableBlock = (
    <div id={id} hidden={!shown}>
      <Table {...table} />
    </div>
  );
  return { button, tableBlock };
}

/** A chart with its title and caption, the table button beside the title, and the table below the chart. */
export function ChartCard({ title, caption, legend, table, children }: { title: string; caption: string; legend?: ReactNode; table: TextTable; children: ReactNode }) {
  const { button, tableBlock } = useTableToggle(table);
  return (
    <figure className="card m-0 flex flex-col gap-3.5 px-5 pt-[18px] pb-3.5">
      <figcaption className="flex items-start justify-between gap-3">
        <CardTitle title={title} caption={caption} />
        {button}
      </figcaption>
      {legend}
      {children}
      {tableBlock}
    </figure>
  );
}

/** The table button with its table below it, for a small chart inside another card. */
export function DataTableDisclosure({ table }: { table: TextTable }) {
  const { button, tableBlock } = useTableToggle(table);
  return (
    <div className="flex flex-col gap-2">
      {button}
      {tableBlock}
    </div>
  );
}
