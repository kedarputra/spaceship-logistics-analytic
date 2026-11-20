import type { ReactNode } from "react";

/** A table whose cells are already formatted text. */
export interface TextTable {
  headers: string[];
  rows: string[][];
}

/** A bordered table that scrolls sideways on a narrow screen rather than widening the page. */
export function Table({ headers, rows }: TextTable) {
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full border-collapse text-left text-small">
        <thead>
          <tr className="bg-inset text-muted">
            {headers.map((header, index) => (
              <th key={`${index}-${header}`} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr key={`${rowIndex}-${cells[0]}`} className="border-t border-grid">
              {cells.map((cell, index) => (
                <td key={`${index}-${headers[index]}`} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
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
