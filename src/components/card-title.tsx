import { InfoButton } from "./info-button";

/**
 * A card's title, and after it an info button with what the card counts over which dates (ticket 30:
 * no subtext under titles). A link can open the page at the title by its `id`. `detail` is data only,
 * such as the rows shown.
 */
export function CardTitle({ id, title, info, detail }: { id?: string; title: string; info?: readonly string[]; detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <h2 id={id} className="scroll-mt-6 text-card-title">
          {title}
        </h2>
        {info === undefined ? null : <InfoButton title={title} lines={info} />}
      </div>
      {detail === undefined ? null : <p className="text-caption text-muted">{detail}</p>}
    </div>
  );
}
