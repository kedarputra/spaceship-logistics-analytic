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
  /** The columns after the first hold numbers, right-aligned. */
  numeric?: boolean;
  /** The column the rows are sorted by, highest first: marked with ↓ and aria-sort. */
  sortedBy?: number;
  /** A totals row. */
  footer?: ReactNode[];
  /** Each row's first cell holds a RowLink that stretches over the row (ticket 29). */
  linkedRows?: boolean;
}

const CELL = "px-3 py-2";

/** A bordered table that scrolls sideways on a narrow screen rather than widening the page. */
export function Table({ headers, rows, rowHeaders = false, numeric = false, sortedBy, footer, linkedRows = false }: TableProps) {
  const align = (column: number) => (numeric && column > 0 ? "text-right whitespace-nowrap" : "text-left");
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
            {headers.map((header, column) => (
              <th
                key={`${column}-${header}`}
                scope="col"
                aria-sort={column === sortedBy ? "descending" : undefined}
                className={`${CELL} font-semibold whitespace-nowrap ${align(column)}`}
              >
                {header}
                {column === sortedBy ? <span aria-hidden="true"> ↓</span> : null}
              </th>
            ))}
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
