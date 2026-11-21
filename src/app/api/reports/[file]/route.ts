import { monthLabel } from "@/components/report-sections";
import { DATASET_FILE, getDataset } from "@/domain/orders";
import { monthlyReport, reportMonths } from "@/tools/report";
import { reportCsv } from "@/tools/report-csv";
import { withApiRole } from "../../../auth";
import { errorResponse } from "../../body";
import { renderReportPdf, reportPdfName } from "../report-pdf";

/** "2025-11.pdf" or "2025-11.csv". */
const REPORT_FILE = /^(\d{4}-\d{2})\.(pdf|csv)$/;

/**
 * GET /api/reports/<YYYY-MM>.pdf and .csv: the monthly report as a file (ticket 34), for a month the data
 * covers. A download, so analysts and admins (ADR 0012); under /api/, so the proxy counts it toward the
 * per-IP limit as it does the orders CSV (ADR 0010 §5). Made on the server from the data in memory:
 * nothing is fetched and nothing leaves it.
 */
export const GET = withApiRole("download", async (request) => {
  const dataset = getDataset();
  const file = new URL(request.url).pathname.split("/").at(-1) ?? "";
  const [, month = "", kind] = REPORT_FILE.exec(file) ?? [];
  const report = monthlyReport(dataset, month);
  if (report === undefined) {
    const months = reportMonths(dataset.orders);
    return errorResponse(
      404,
      `There is no such report. Reports cover each month from ${monthLabel(months[0] ?? "")} to ${monthLabel(months.at(-1) ?? "")}, as YYYY-MM.pdf or YYYY-MM.csv.`,
    );
  }
  if (kind === "csv") {
    return new Response(reportCsv(report), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="wms-report-${month}.csv"` },
    });
  }
  const pdf = await renderReportPdf(report, { dataset: DATASET_FILE, generatedAt: new Date() });
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${reportPdfName(month)}"` },
  });
});
