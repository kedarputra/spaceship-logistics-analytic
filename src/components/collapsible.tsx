"use client";

import { type ReactNode, useId, useState } from "react";
import { Icon } from "./icons";

/**
 * A collapsible (ticket 30): a button and the region it opens, such as "Data table" and "How this was
 * computed". The region's height grows from 0 to its content and its content fades in (the
 * collapsible utility in globals.css); closing runs the same motion back.
 */

/** Both halves from one value, so the button never says open while the region is closed. */
export function disclosure(open: boolean, id: string) {
  return {
    button: { "aria-expanded": open, "aria-controls": id },
    region: { id, open },
  };
}

/** A collapsible's state, closed at first, and the props for its button and its region. */
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  const { button, region } = disclosure(open, useId());
  return { open, button: { ...button, onClick: () => setOpen(!open) }, region };
}

/**
 * The region. Its content stays in the page so it can grow from nothing; closed, it has no height and
 * nothing in it can be read or focused. Spacing above the content belongs inside it, so a closed region
 * adds none.
 */
export function CollapsibleRegion({ id, open, className, children }: { id: string; open: boolean; className?: string; children: ReactNode }) {
  return (
    <div id={id} data-open={open ? "" : undefined} inert={!open} className={`collapsible ${className ?? ""}`}>
      <div>{children}</div>
    </div>
  );
}

const TURNS = {
  /** Right when closed, down when open: a panel's heading. */
  panel: "group-aria-expanded:rotate-90",
  /** Down when closed, up when open: a button that opens something below it. */
  below: "rotate-90 group-aria-expanded:-rotate-90",
} as const;

/** A chevron that turns with its button's aria-expanded, at the collapsible's pace. The button needs `group`. */
export function DisclosureChevron({ turn, size = 16 }: { turn: keyof typeof TURNS; size?: number }) {
  return <Icon name="chevron" size={size} strokeWidth={2} className={`shrink-0 text-grey-green transition-transform duration-(--dur-2) ${TURNS[turn]}`} />;
}
