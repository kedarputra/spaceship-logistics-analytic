/** A card's title and, below it, what it counts over which dates. A link can open the page at the title by its `id`. */
export function CardTitle({ id, title, caption }: { id?: string; title: string; caption: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className="scroll-mt-6 text-card-title">
        {title}
      </h2>
      <p className="text-caption text-muted">{caption}</p>
    </div>
  );
}
