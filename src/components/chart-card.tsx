"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CardTitle } from "./card-title";
import { CollapsibleRegion, DisclosureChevron, useDisclosure } from "./collapsible";
import { Table, type TextTable } from "./text-table";

/** Where a closed table region sits: its spacing above lives inside it, so closed it adds none. */
const SPACING = {
  /** Below a chart card's chart. */
  card: { region: "-mt-3.5", inner: "pt-3.5" },
  /** Below the button, inside another card. */
  inline: { region: "-mt-2", inner: "pt-2" },
} as const;

/**
 * A chart's values as a table, behind a "Data table" button (ADR 0011 §3: values never rest on the
 * marks alone). The table is in the page from the start, its region closed until asked for (ticket 30).
 */
function useTableToggle(table: TextTable, spacing: keyof typeof SPACING) {
  const { button: toggleProps, region } = useDisclosure();
  const toggle = (
    <button type="button" {...toggleProps} className="group button-small shrink-0 gap-1.5 self-start">
      Data table
      <DisclosureChevron turn="below" size={14} />
    </button>
  );
  const tableBlock = (
    <CollapsibleRegion {...region} className={SPACING[spacing].region}>
      <div className={SPACING[spacing].inner}>
        <Table {...table} />
      </div>
    </CollapsibleRegion>
  );
  return { button: toggle, tableBlock };
}

interface ChartCardProps {
  /** The title's id, which labels the figure. */
  id?: string;
  title: string;
  /** What the chart counts over which dates, and its notes: in the info popover after the title (ticket 30). */
  info: readonly string[];
  legend?: ReactNode;
  /** The chart's values. Bars that print every value beside them need none. */
  table?: TextTable;
  /** A page that shows more, beside the table button. */
  link?: { href: string; label: string };
  children: ReactNode;
}

/** A chart card: the title and its info, the table button and any link beside them, the chart, and the table below it. */
export function ChartCard(props: ChartCardProps) {
  return props.table === undefined ? <ChartCardLayout {...props} /> : <ChartCardWithTable {...props} table={props.table} />;
}

function ChartCardWithTable(props: ChartCardProps & { table: TextTable }) {
  const { button, tableBlock } = useTableToggle(props.table, "card");
  return <ChartCardLayout {...props} button={button} tableBlock={tableBlock} />;
}

function ChartCardLayout({ id, title, info, legend, link, children, button, tableBlock }: ChartCardProps & { button?: ReactNode; tableBlock?: ReactNode }) {
  return (
    <figure aria-labelledby={id} className="card m-0 flex flex-col gap-3.5 px-5 pt-[18px] pb-3.5">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle id={id} title={title} info={info} />
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
  const { button, tableBlock } = useTableToggle(table, "inline");
  return (
    <div className="flex flex-col gap-2">
      {button}
      {tableBlock}
    </div>
  );
}
