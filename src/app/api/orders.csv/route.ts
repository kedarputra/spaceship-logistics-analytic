import { paramsRecord, readOrdersView } from "@/components/orders-url";
import { getDataset, ordersCsv } from "@/domain/orders";
import { isFiltered, ordersInView } from "@/tools/orders-view";
import { withApiRole } from "../../auth";

/**
 * GET /api/orders.csv?…: the orders a Raw data view shows, in its sort and across all its pages, as
 * the file writes them (ticket 28). It takes the page's own parameters and, like the page, skips
 * any it cannot apply. Under /api/, so the proxy counts it toward the per-IP limit (ADR 0010 §5).
 * A download, so analysts and admins (ticket 31).
 */
export const GET = withApiRole("download", (request) => {
  const { orders } = getDataset();
  const { view } = readOrdersView(paramsRecord(new URL(request.url).searchParams), orders);
  return new Response(ordersCsv(ordersInView(orders, view)), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${isFiltered(view) ? "orders-filtered.csv" : "orders.csv"}"`,
    },
  });
});
