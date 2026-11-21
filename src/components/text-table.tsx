import Link from "next/link";
import type { ReactNode } from "react";

/** A table whose cells are already formatted text. */
export interface TextTable {
  headers: string[];
  rows: string[][];
}

interface TableProps {
  headers: string[];
  rows: ReactNode[][];
  /** The first cell of each row names it, as a row header. */
  rowHeaders?: boolean;
  /** The columns from this one on hold numbers, right-aligned: 1 for every column after the first. */
  numericFrom?: number;
  /** No cell wraps: short codes such as order IDs and dates keep one line, and the table scrolls sideways instead. */
  noWrap?: boolean;
  /** The column the rows are sorted by: marked with an arrow and aria-sort, highest first unless `sortDirection` says otherwise. */
  sortedBy?: number;
  sortDirection?: "asc" | "desc";
  /** Each heading's link that sorts the rows by its column (ticket 33). Without it, the headings are text. */
  sortHref?: (column: number) => string;
  /** A totals row. */
  footer?: ReactNode[];
  /** Each row's first cell holds a RowLink that stretches over the row (ticket 29). */
  linkedRows?: boolean;
}

const CELL = "px-3 py-2";

/** A sorted column's aria-sort and its arrow, either way; the Raw data table marks its sort the same. */
export const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
export const ARROW = { asc: "↑", desc: "↓" } as const;

/** A bordered table that scrolls sideways on a narrow screen rather than widening the page. */
export function Table({ headers, rows, rowHeaders = false, numericFrom, noWrap = false, sortedBy, sortDirection = "desc", sortHref, footer, linkedRows = false }: TableProps) {
  const isNumeric = (column: number) => numericFrom !== undefined && column >= numericFrom;
  const align = (column: number) => (isNumeric(column) ? "text-right whitespace-nowrap" : `text-left${noWrap ? " whitespace-nowrap" : ""}`);
  const cell = (content: ReactNode, column: number, key: string) =>
    rowHeaders && column === 0 ? (
      <th key={key} scope="row" className={`${CELL} text-left font-semibold whitespace-nowrap`}>
        {content}
      </th>
    ) : (
      <td key={key} className={`${CELL} ${align(column)}`}>
        {content}
      </td>
    );
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr className="bg-inset text-muted">
            {headers.map((header, column) => {
              const arrow = column === sortedBy ? <span aria-hidden="true"> {ARROW[sortDirection]}</span> : null;
              return (
                <th
                  key={`${column}-${header}`}
                  scope="col"
                  aria-sort={column === sortedBy ? ARIA_SORT[sortDirection] : undefined}
                  className={`${sortHref === undefined ? CELL : "p-0"} font-semibold whitespace-nowrap ${align(column)}`}
                >
                  {sortHref === undefined ? (
                    <>
                      {header}
                      {arrow}
                    </>
                  ) : (
                    // The link fills the cell, so the whole heading sorts.
                    <Link href={sortHref(column)} scroll={false} className={`block ${CELL} text-muted no-underline hover:text-ink`}>
                      {header}
                      {arrow}
                    </Link>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, row) => (
            <tr key={row} className={`border-t border-grid ${linkedRows ? "relative hover:bg-inset" : ""}`}>
              {cells.map((content, column) => cell(content, column, `${column}-${headers[column]}`))}
            </tr>
          ))}
        </tbody>
        {footer === undefined ? null : (
          <tfoot>
            <tr className="border-t-2 border-line bg-inset font-semibold">{footer.map((content, column) => cell(content, column, `${column}-${headers[column]}`))}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** One term and its value in an explanation panel. */
export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-5 gap-y-1 sm:grid-cols-[minmax(120px,160px)_minmax(0,1fr)]">
      <dt className="text-muted">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
