import { getDataset, ordersCsv } from "@/domain/orders";
import { withApiRole } from "../../../auth";

/** The template's rows: the file's first five, under its header. */
const TEMPLATE_ROWS = 5;

/**
 * GET /api/import/template: a CSV to start an import from (ticket 35), the header and the first 5 rows of
 * the file in data/, written as the file writes them. Always the file, whatever this session has
 * imported. For admins, beside the import itself.
 */
export const GET = withApiRole("import", () =>
  new Response(ordersCsv(getDataset().orders.slice(0, TEMPLATE_ROWS)), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="orders-template.csv"' },
  }),
);
