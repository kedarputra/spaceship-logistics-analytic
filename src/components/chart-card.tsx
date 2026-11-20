"use client";

import Link from "next/link";
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

interface ChartCardProps {
  /** The title's id, which labels the figure. */
  id?: string;
  title: string;
  caption: string;
  legend?: ReactNode;
  /** The chart's values. Bars that print every value beside them need none. */
  table?: TextTable;
  /** A page that shows more, beside the table button. */
  link?: { href: string; label: string };
  children: ReactNode;
}

/** A chart card: the title and caption, the table button and any link beside them, the chart, and the table below it. */
export function ChartCard(props: ChartCardProps) {
  return props.table === undefined ? <ChartCardLayout {...props} /> : <ChartCardWithTable {...props} table={props.table} />;
}

function ChartCardWithTable(props: ChartCardProps & { table: TextTable }) {
  const { button, tableBlock } = useTableToggle(props.table);
  return <ChartCardLayout {...props} button={button} tableBlock={tableBlock} />;
}

function ChartCardLayout({ id, title, caption, legend, link, children, button, tableBlock }: ChartCardProps & { button?: ReactNode; tableBlock?: ReactNode }) {
  return (
    <figure aria-labelledby={id} className="card m-0 flex flex-col gap-3.5 px-5 pt-[18px] pb-3.5">
      <figcaption className="flex items-start justify-between gap-3">
        <CardTitle id={id} title={title} caption={caption} />
        <span className="flex shrink-0 flex-wrap justify-end gap-2">
          {link === undefined ? null : (
            <Link href={link.href} className="button-small no-underline">
              {link.label}
            </Link>
          )}
          {button}
        </span>
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
