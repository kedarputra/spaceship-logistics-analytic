import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { type MonthlyReport, monthlyReport } from "@/tools/report";
import { monthLabel, type ReportSection, reportSections, reportWeeks } from "./report-sections";

// What the Reports page and the PDF both say (ticket 34): one source, so they cannot disagree.
function reportFor(month: string): MonthlyReport {
  const report = monthlyReport(getDataset(), month);
  if (report === undefined) throw new Error(`No report for ${month}`);
  return report;
}

function section(sections: ReportSection[], id: ReportSection["id"]): ReportSection {
  const found = sections.find((each) => each.id === id);
  if (found === undefined) throw new Error(`No section ${id}`);
  return found;
}

describe("the monthly report's sections (ticket 34)", () => {
  const november = reportSections(reportFor("2025-11"));

  it("names a month as the app does: Nov 2025", () => {
    expect(monthLabel("2025-11")).toBe("Nov 2025");
  });

  it("comes in the ticket's order, each stating its period basis once, in its header", () => {
    expect(november.map(({ id, title, basis }) => [id, title, basis])).toEqual([
      ["placed", "Orders placed", "Nov 2025 · by order date"],
      ["completed", "Deliveries completed", "Nov 2025 · by delivery date"],
      ["outcomes", "Delivery outcomes", "Nov 2025 · by delivery date"],
      ["carriers", "Carriers", "Nov 2025 · by delivery date"],
      ["warehouses", "Warehouse scorecard", "Nov 2025 · orders by order date, deliveries by delivery date"],
      ["categories", "Top categories", "Nov 2025 · by order date"],
      ["skus", "Top SKUs", "Nov 2025 · by order date"],
      ["attention", "Needs attention", "Placed in Nov 2025 · still in transit on 31 Dec 2025, or canceled"],
    ]);
  });

  it("gives the orders placed and the deliveries completed beside Oct's, with the change, rates in points", () => {
    expect(section(november, "placed").table).toMatchObject({
      headers: ["Figure", "Nov 2025", "Oct 2025", "Change"],
      rows: [
        ["Orders", "24", "26", "−2"],
        ["Units", "113", "79", "+34"],
        ["Gross value", "$1,600.98", "$912.02", "+$688.96"],
      ],
    });
    expect(section(november, "completed").table.rows).toEqual([
      ["Delivered orders", "19", "22", "−3"],
      ["On-time rate", "84.2% · 16 of 19", "81.8% · 18 of 22", "+2.4 points"],
      ["Delay rate", "15.8% · 3 of 19", "13.6% · 3 of 22", "+2.2 points"],
      ["Avg delivery time", "3.7 days", "3.3 days", "+0.4 days"],
    ]);
    expect(section(reportSections(reportFor("2025-12")), "completed").table.rows[1]).toEqual(["On-time rate", "84.6% · 22 of 26", "84.2% · 16 of 19", "+0.4 points"]);
  });

  it("drops the month-before columns for the first month of the data", () => {
    expect(section(reportSections(reportFor("2025-01")), "placed").table).toMatchObject({ headers: ["Figure", "Jan 2025"], rows: [["Orders", "75"], ["Units", "233"], expect.any(Array)] });
  });

  it("splits the deliveries by outcome with their shares, and the weeks for the chart, the clipped first week noted", () => {
    expect(section(november, "outcomes").table).toMatchObject({
      headers: ["Outcome", "Orders", "Rate", "Oct 2025"],
      rows: [
        ["On time", "16", "84.2%", "18"],
        ["Delayed", "3", "15.8%", "3"],
        ["Exception", "0", "0.0%", "1"],
      ],
    });
    const weeks = reportWeeks(reportFor("2025-11"));
    expect(weeks.bars.map(({ label, values, delivered }) => [label, values.onTime, values.delayed, values.exception, delivered])).toEqual([
      ["w/c 27 Oct", 1, 0, 0, 1],
      ["w/c 3 Nov", 3, 1, 0, 4],
      ["w/c 10 Nov", 3, 0, 0, 3],
      ["w/c 17 Nov", 6, 2, 0, 8],
      ["w/c 24 Nov", 3, 0, 0, 3],
    ]);
    expect(weeks.note).toBe("Weeks run Monday to Sunday. w/c 27 Oct: 1–2 Nov only.");
    expect(section(november, "outcomes").info).toContain(weeks.note);
  });

  it("lists the carriers with the small-sample tag under 20 delivered orders", () => {
    const { table } = section(november, "carriers");
    expect(table.headers).toEqual(["Carrier", "Delivered", "On time", "Delayed", "On-time rate"]);
    expect(table.rows.slice(0, 3)).toEqual([
      ["USPS", "5", "3", "2", "60.0%"],
      ["FedEx", "4", "4", "0", "100.0%"],
      ["UPS", "4", "3", "1", "75.0%"],
    ]);
    expect(table.smallSample).toEqual(Array.from({ length: 8 }, () => true));
  });

  it("scores the warehouses in Network's columns, with a total", () => {
    const { table } = section(november, "warehouses");
    expect(table.headers).toEqual(["Warehouse", "Orders", "Units", "Gross value", "Delivered", "On-time rate", "Delay rate", "Avg delivery time"]);
    expect(table.rows).toContainEqual(["EWR-DC1", "8", "45", "$833.57", "7", "100.0%", "0.0%", "3.0 days"]);
    expect(table.rows.at(-1)).toEqual(["AMS-FC1", "2", "6", "$71.25", "0", "n/a", "n/a", "n/a"]);
    expect(table.footer).toEqual(["All warehouses", "24", "113", "$1,600.98", "19", "84.2%", "15.8%", "3.7 days"]);
  });

  it("ranks the top 5 categories and SKUs by gross value, the categories with their share of the month's", () => {
    expect(section(november, "categories").table.rows.slice(0, 3).map((row) => [row[0], row[3], row[4]])).toEqual([
      ["PAINT", "$406.92", "25.4%"],
      ["MARKER", "$285.69", "17.8%"],
      ["PAPER", "$272.44", "17.0%"],
    ]);
    expect(section(november, "categories").table.rows).toHaveLength(5);
    expect(section(november, "skus").table.rows[0]).toEqual(["PAINT-0037", "PAINT", "1", "11", "$298.87"]);
    expect(section(november, "skus").table.rows).toHaveLength(5);
  });

  it("lists the orders still in transit with their days in transit, and canceled orders with none", () => {
    expect(section(november, "attention").table).toMatchObject({
      headers: ["Order", "Ordered", "Carrier", "Warehouse", "Status", "Days in transit"],
      rows: [
        ["ORD-2026-542610-0082", "3 Nov 2025", "DHL", "DFW-DC1", "In transit", "58"],
        ["ORD-2026-571946-0024", "13 Nov 2025", "UPS", "BER-FC1", "In transit", "48"],
        ["ORD-2026-108980-0325", "19 Nov 2025", "FedEx", "LAX-DC1", "In transit", "42"],
        ["ORD-2026-682573-0181", "21 Nov 2025", "OnTrac", "AMS-FC1", "In transit", "40"],
      ],
    });
    expect(section(reportSections(reportFor("2025-03")), "attention").table.rows[1]).toEqual(["ORD-2026-975697-0193", "7 Mar 2025", "UPS", "EWR-DC1", "Canceled", ""]);
  });
});
