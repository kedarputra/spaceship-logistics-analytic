/**
 * Reading server-rendered markup in tests (ticket 30): the text a reader sees with every info popover
 * closed, and the words an info button opens.
 */

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'" };

function decoded(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity] ?? entity);
}

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The markup without the info popovers, which are closed until asked for. */
export function withoutPopovers(html: string): string {
  return html.replace(/<div[^>]*data-info-popover[^>]*>.*?<\/div>/gs, "");
}

/** The text a reader sees, with the markup between text read as one space and the popovers closed. */
export function visibleText(html: string): string {
  return decoded(withoutPopovers(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

/** The lines the info button "About `title`" opens, or undefined when there is no such button. */
export function infoLines(html: string, title: string): string[] | undefined {
  const button = new RegExp(`<button[^>]*aria-label="About ${literal(title)}"[^>]*>`).exec(html)?.[0];
  const id = button === undefined ? undefined : /aria-controls="([^"]+)"/.exec(button)?.[1];
  if (id === undefined) return undefined;
  const popover = new RegExp(`<div[^>]*id="${literal(id)}"[^>]*>(.*?)</div>`, "s").exec(html)?.[1];
  if (popover === undefined) throw new Error(`The info button "About ${title}" controls nothing`);
  return [...popover.matchAll(/<p>(.*?)<\/p>/gs)].map((match) => decoded(match[1] ?? ""));
}

/** Every info button's title, in page order. */
export function infoTitles(html: string): string[] {
  return [...html.matchAll(/<button[^>]*aria-label="About ([^"]+)"/g)].map((match) => decoded(match[1] ?? ""));
}
