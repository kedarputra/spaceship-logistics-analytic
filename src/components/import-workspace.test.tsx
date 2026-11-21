import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dashboardKpis } from "@/domain/definitions";
import { getDataset } from "@/domain/orders";
import type { ImportCheck } from "./import-result";
import { CheckResult, ImportWorkspace } from "./import-workspace";
import { visibleText } from "./markup-text";

const result = (check: ImportCheck) => renderToStaticMarkup(<CheckResult check={check} using={false} onUse={() => undefined} />);
const useButton = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*Use this data/s.exec(html)?.[0] ?? "";

describe("Import's workspace (ticket 35)", () => {
  it("offers a drop zone with a file picker for .csv files, and the template", () => {
    const html = renderToStaticMarkup(<ImportWorkspace rules={["A rule."]} />);
    expect(visibleText(html)).toContain("Orders file Download a template Drop a CSV file here Choose a file");
    expect(html).toMatch(/<a href="\/api\/import\/template" download=""/);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept=".csv,text\/csv,text\/plain"/);
  });

  it("shows a file's rows and problems, the first 100 in a table with how many more, and no way to use it", () => {
    const problems = Array.from({ length: 100 }, (_, index) => ({ row: index + 2, column: "carrier", message: 'Unknown carrier "Acme"' }));
    const html = result({ fileName: "bad.csv", rows: 400, problemCount: 340, problems: [{ row: 1, column: null, message: "The columns are in another order" }, ...problems.slice(1)] });
    const text = visibleText(html);
    expect(text).toContain("bad.csv 400 rows · 340 problems");
    expect(text).toContain("Row Column Problem 1 The columns are in another order 3 carrier Unknown carrier");
    expect(text).toContain("and 240 more");
    expect(useButton(html)).toContain("disabled");
  });

  it("calls a file-wide problem's row File", () => {
    expect(visibleText(result({ fileName: "big.csv", rows: 0, problemCount: 1, problems: [{ row: null, column: null, message: "Over 5 MB" }] }))).toContain("File Over 5 MB");
  });

  it("previews a clean file's five KPIs and its date, opening nothing, and lets it be used", () => {
    const { orders } = getDataset();
    const html = result({ fileName: "ok.csv", rows: 400, problemCount: 0, problems: [], preview: { anchor: "2025-12-31", kpis: dashboardKpis(orders) } });
    const text = visibleText(html);
    expect(text).toContain("ok.csv 400 rows · 0 problems Use this data Data as of 31 Dec 2025");
    expect(text).toContain("Total orders 400 27 in transit · 3 canceled");
    expect(html).not.toContain("<a ");
    expect(useButton(html)).not.toContain("disabled");
  });
});
