import { ImportWorkspace } from "@/components/import-workspace";
import { PageHeader } from "@/components/page-header";
import { type Dataset, IMPORT_LIMITS, IMPORT_LIMITS_TEXT } from "@/domain/orders";
import { IMPORT_LIFETIME_MS } from "../import-store";

/** The import rules in words, from the limits the server checks (ADR 0013 §2), for the Orders file's info popover. */
const RULES = [
  "The header is the file's 17 columns, in its order; the template has them.",
  "Carrier, region, warehouse, origin and category take a value the data already has. Order IDs are unique.",
  "A delivery date is empty exactly for orders in transit or canceled, and never before the order date. Order value is quantity × unit price, to the cent.",
  `Client, order ID, destination and SKU are at most ${IMPORT_LIMITS.textLength} characters and don't start with =, +, - or @.`,
  `${IMPORT_LIMITS_TEXT.both.replace(/^at most/, "At most")}, as UTF-8 text.`,
  `The data is for this session only: it goes on sign-out, after ${IMPORT_LIFETIME_MS / 3_600_000} hours, or when the server restarts, and is never saved.`,
];

/**
 * Import data (ticket 35, ADR 0013), for admins: check an orders CSV against the import rules, then view
 * the whole app on it for this session only. Linked from Reports. Nothing is saved; the banner on every
 * page says while an import is in use and leads back to the original data.
 */
export function ImportPage({ dataset }: { dataset: Dataset }) {
  return (
    <>
      <PageHeader label="Admin" title="Import data" asOf={dataset.anchor} />
      <ImportWorkspace rules={RULES} />
    </>
  );
}
