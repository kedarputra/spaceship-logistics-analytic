import { describe, expect, it } from "vitest";
import { getDataset } from "@/domain/orders";
import { monthlyReport } from "./report";
import { REPORT_CSV_HEADER, reportCsv } from "./report-csv";

function csvFor(month: string): string[] {
  const report = monthlyReport(getDataset(), month);
  if (report === undefined) throw new Error(`No report for ${month}`);
  return reportCsv(report).split("\n");
}

describe("the monthly report as CSV (ticket 34)", () => {
  const lines = csvFor("2025-11");

  it("has one header, section, item, metric, value and previous_month, and ends with a line break", () => {
    expect(REPORT_CSV_HEADER).toEqual(["section", "item", "metric", "value", "previous_month"]);
    expect(lines[0]).toBe("section,item,metric,value,previous_month");
    expect(lines.at(-1)).toBe("");
  });

  it("gives Nov's summary as numbers, each with Oct's: rates as fractions, days unrounded, money to the cent", () => {
    expect(lines.slice(1, 8)).toEqual([
      "summary,all,order_count,24,26",
      "summary,all,units,113,79",
      "summary,all,gross_order_value,1600.98,912.02",
      "summary,all,delivered_orders,19,22",
      `summary,all,on_time_rate,${16 / 19},${18 / 22}`,
      `summary,all,delay_rate,${3 / 19},${3 / 22}`,
      `summary,all,average_delivery_time,${71 / 19},${73 / 22}`,
    ]);
  });

  it("gives the delivery outcomes, then each week of delivery, named by its Monday, its deliveries and their outcomes, with nothing to compare", () => {
    expect(lines.slice(8, 11)).toEqual(["delivery_outcomes,all,on_time_deliveries,16,18", "delivery_outcomes,all,delayed_orders,3,3", "delivery_outcomes,all,exception_orders,0,1"]);
    expect(lines.filter((line) => line.startsWith("delivery_outcomes_by_week,"))).toEqual([
      "delivery_outcomes_by_week,2025-10-27,delivered_orders,1,",
      "delivery_outcomes_by_week,2025-10-27,on_time_deliveries,1,",
      "delivery_outcomes_by_week,2025-10-27,delayed_orders,0,",
      "delivery_outcomes_by_week,2025-10-27,exception_orders,0,",
      "delivery_outcomes_by_week,2025-11-03,delivered_orders,4,",
      "delivery_outcomes_by_week,2025-11-03,on_time_deliveries,3,",
      "delivery_outcomes_by_week,2025-11-03,delayed_orders,1,",
      "delivery_outcomes_by_week,2025-11-03,exception_orders,0,",
      "delivery_outcomes_by_week,2025-11-10,delivered_orders,3,",
      "delivery_outcomes_by_week,2025-11-10,on_time_deliveries,3,",
      "delivery_outcomes_by_week,2025-11-10,delayed_orders,0,",
      "delivery_outcomes_by_week,2025-11-10,exception_orders,0,",
      "delivery_outcomes_by_week,2025-11-17,delivered_orders,8,",
      "delivery_outcomes_by_week,2025-11-17,on_time_deliveries,6,",
      "delivery_outcomes_by_week,2025-11-17,delayed_orders,2,",
      "delivery_outcomes_by_week,2025-11-17,exception_orders,0,",
      "delivery_outcomes_by_week,2025-11-24,delivered_orders,3,",
      "delivery_outcomes_by_week,2025-11-24,on_time_deliveries,3,",
      "delivery_outcomes_by_week,2025-11-24,delayed_orders,0,",
      "delivery_outcomes_by_week,2025-11-24,exception_orders,0,",
    ]);
  });

  it("gives each carrier's deliveries, with 0 for one that delivered nothing in Oct and no rate to compare", () => {
    expect(lines.filter((line) => line.startsWith("carriers,USPS,"))).toEqual([
      "carriers,USPS,delivered_orders,5,5",
      "carriers,USPS,on_time_deliveries,3,3",
      "carriers,USPS,delayed_orders,2,2",
      "carriers,USPS,on_time_rate,0.6,0.6",
    ]);
    expect(lines.filter((line) => line.startsWith("carriers,GLS,"))).toEqual([
      "carriers,GLS,delivered_orders,1,0",
      "carriers,GLS,on_time_deliveries,1,0",
      "carriers,GLS,delayed_orders,0,0",
      "carriers,GLS,on_time_rate,1,",
    ]);
    expect(lines.filter((line) => line.startsWith("carriers,")).map((line) => line.split(",")[1])).toEqual(
      ["USPS", "FedEx", "UPS", "Royal Mail", "DPD", "GLS", "LaserShip", "OnTrac"].flatMap((carrier) => Array.from({ length: 4 }, () => carrier)),
    );
  });

  it("gives the warehouse scorecard, an empty cell where a warehouse delivered nothing", () => {
    expect(lines.filter((line) => line.startsWith("warehouses,AMS-FC1,"))).toEqual([
      "warehouses,AMS-FC1,order_count,2,2",
      "warehouses,AMS-FC1,units,6,10",
      "warehouses,AMS-FC1,gross_order_value,71.25,91.5",
      "warehouses,AMS-FC1,delivered_orders,0,1",
      "warehouses,AMS-FC1,on_time_rate,,1",
      "warehouses,AMS-FC1,delay_rate,,0",
      "warehouses,AMS-FC1,average_delivery_time,,3",
    ]);
    expect(lines.filter((line) => line.startsWith("warehouses,"))).toHaveLength(9 * 7);
  });

  it("gives the top 5 categories and SKUs by gross value, each with its value the month before", () => {
    expect(lines.filter((line) => line.startsWith("top_categories,") && line.includes(",gross_order_value,"))).toEqual([
      "top_categories,PAINT,gross_order_value,406.92,64.6",
      "top_categories,MARKER,gross_order_value,285.69,226.7",
      "top_categories,PAPER,gross_order_value,272.44,35.61",
      "top_categories,BOOK,gross_order_value,265.96,270.07",
      "top_categories,BRUSH,gross_order_value,248.37,73.63",
    ]);
    expect(lines.filter((line) => line.startsWith("top_skus,PAINT-0037,"))).toEqual([
      "top_skus,PAINT-0037,order_count,1,0",
      "top_skus,PAINT-0037,units,11,0",
      "top_skus,PAINT-0037,gross_order_value,298.87,0",
    ]);
    expect(lines.filter((line) => line.startsWith("top_skus,"))).toHaveLength(5 * 3);
  });

  it("counts the orders placed in the month still in transit on the anchor date, and the canceled", () => {
    expect(lines.filter((line) => line.startsWith("needs_attention,"))).toEqual(["needs_attention,in_transit,order_count,4,2", "needs_attention,canceled,order_count,0,0"]);
  });

  it("leaves previous_month empty for the first month of the data", () => {
    const january = csvFor("2025-01");
    expect(january[1]).toBe("summary,all,order_count,75,");
    expect(january.slice(1, -1).every((line) => line.endsWith(","))).toBe(true);
  });
});
