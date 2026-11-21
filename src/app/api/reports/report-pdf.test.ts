import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { monthlyReport, reportMonths } from "@/tools/report";
import { pdfPages } from "./pdf-text";
import { renderReportPdf, reportPdfName } from "./report-pdf";

// Noon UTC is the same calendar day in every time zone a server might run in.
const context = { dataset: "mock_logistics_data.csv", generatedAt: new Date("2026-11-21T12:00:00Z") };

describe("the monthly report's PDF (ticket 34)", () => {
  it("is named wms-report-<YYYY-MM>.pdf", () => {
    expect(reportPdfName("2025-11")).toBe("wms-report-2025-11.pdf");
  });

  it("fits every month of the data on one or two pages, January's 75 orders and May's five in transit included", async () => {
    const { orders } = getDataset();
    const counts: [string, number][] = [];
    for (const month of reportMonths(orders)) {
      const report = monthlyReport(getDataset(), month);
      if (report === undefined) throw new Error(`No report for ${month}`);
      counts.push([month, pdfPages(await renderReportPdf(report, context)).length]);
    }
    expect(counts.map(([month]) => month)).toHaveLength(12);
    expect(counts.filter(([, pages]) => pages < 1 || pages > 2)).toEqual([]);
  });

  it("says the day it was made, and the first month has nothing to compare", async () => {
    const report = monthlyReport(getDataset(), "2025-01");
    if (report === undefined) throw new Error("No report for 2025-01");
    const lines = pdfPages(await renderReportPdf(report, context)).flat();
    expect(lines).toContain("Dataset mock_logistics_data.csv · Data as of 31 Dec 2025 · Generated 21 Nov 2026");
    expect(lines).toContain("Monthly WMS report · Jan 2025");
    expect(lines).not.toContain("Change");
  });
});
