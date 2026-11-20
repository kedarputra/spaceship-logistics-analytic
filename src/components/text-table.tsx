import type { ReactNode } from "react";

/** A table whose cells are already formatted text. */
export interface TextTable {
  headers: string[];
  rows: string[][];
}

export function Table({ headers, rows }: TextTable) {
  return (
    <table className="mt-2 w-full text-left text-sm tabular-nums">
      <thead>
        <tr>
          {headers.map((header, index) => (
            <th key={`${index}-${header}`} scope="col" className="border-b border-slate-200 py-1 pr-4 font-medium text-slate-600">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, rowIndex) => (
          <tr key={`${rowIndex}-${cells[0]}`}>
            {cells.map((cell, index) => (
              <td key={`${index}-${headers[index]}`} className="border-b border-slate-100 py-1 pr-4">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One term and its value in an explanation panel. */
export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
      <dt className="font-medium text-slate-600">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
