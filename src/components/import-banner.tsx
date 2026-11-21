import { formatCount } from "@/domain/format";
import type { ActiveDataset } from "@/domain/orders";
import { formatDate } from "@/domain/periods";
import { ClearImportButton } from "./clear-import-button";
import { Icon } from "./icons";

/**
 * The banner over every page while this session runs on an import (ticket 35): on the amber tint, with
 * an icon and words, never the colour alone (ADR 0011), the file's name, its orders and its date, and
 * the way back to the original data. Nothing for the file in data/.
 */
export function ImportBanner({ dataset }: { dataset: ActiveDataset }) {
  if (!dataset.imported) return null;
  return (
    <div
      role="status"
      aria-label="Imported data"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-inset border border-warn-line bg-warn-tint px-3.5 py-2.5 text-small text-warn-ink"
    >
      <Icon name="alert" size={17} className="shrink-0 text-warn-icon" />
      <span className="min-w-0 flex-1 basis-60">
        <span className="font-semibold">Imported data: </span>
        <span className="break-all">{dataset.fileName}</span>
        {` · ${formatCount(dataset.orders.length)} ${dataset.orders.length === 1 ? "order" : "orders"} · data as of ${formatDate(dataset.anchor)}`}
      </span>
      <ClearImportButton />
    </div>
  );
}
