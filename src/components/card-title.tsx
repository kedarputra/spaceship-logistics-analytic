/** A card's title and, below it, what it counts over which dates. */
export function CardTitle({ id, title, caption }: { id?: string; title: string; caption: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className="text-card-title">
        {title}
      </h2>
      <p className="text-caption text-muted">{caption}</p>
    </div>
  );
}
