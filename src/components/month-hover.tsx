"use client";

import Link from "next/link";
import { type MouseEvent, type PointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { lowered } from "@/tools/words";
import type { CardLink } from "./card-link";
import { type HoverEvent, type HoverInput, hoverStep, isHoverKey, monthAt, monthCentre, NO_HOVER, type Point, type Slack, tipPlacement } from "./chart-hover";
import { ChartTip, type ChartTipContent, tipText } from "./chart-tip";

/** A month's tooltip, and its orders in Raw data; no link for a month with none. */
export interface MonthTip extends ChartTipContent {
  link?: CardLink;
}

/** How to open a month, by what showed its tooltip. */
const OPEN_ACTION: Record<HoverInput, string> = { pointer: "Click", touch: "Tap again", keys: "Press Enter" };

/** The tooltip's foot, "Click to view the 75 orders"; none for a month with no orders. */
function openingFoot(link: CardLink | undefined, shownBy: HoverInput): string | undefined {
  return link === undefined ? undefined : `${OPEN_ACTION[shownBy]} to ${lowered(link.text)}`;
}

interface MonthHoverProps {
  /** What the plot shows, its accessible name. */
  description: string;
  tips: readonly MonthTip[];
  /** One mark per month, drawn in its slot: a bar, or a point at its height. */
  marks: readonly ReactNode[];
  /** A vertical hairline through the month shown, for a line. */
  crosshair?: boolean;
  slack: Slack;
  /** Drawn under the months, across the plot: the line. */
  children?: ReactNode;
}

/**
 * The hover layer of a hand-drawn month chart (ticket 26). The plot is one tab stop; its months sit
 * side by side, each slot the full height and width of its month, so a slot is the hit target and the
 * nearest month to any point. A mouse shows the month under it and a click opens its orders; the
 * arrows move from month to month and Enter opens one; a tap shows a month and a second tap opens it.
 * The marks arrive drawn on the server: this only says which month is shown (`data-active`).
 */
export function MonthHover({ description, tips, marks, crosshair = false, slack, children }: MonthHoverProps) {
  const [hover, setHover] = useState(NO_HOVER);
  const plot = useRef<HTMLDivElement>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  const pointerType = useRef<string | null>(null);
  const shown = hover.month === null ? undefined : tips[hover.month];

  function step(event: HoverEvent): number | null {
    const next = hoverStep(hover, event, tips.length);
    setHover(next.state);
    return next.open;
  }

  /** The index of the month under the pointer, and where the pointer is in the plot. */
  function pointerIn(area: HTMLDivElement, event: MouseEvent): { month: number; at: Point } {
    const box = area.getBoundingClientRect();
    const at = { x: event.clientX - box.left, y: event.clientY - box.top };
    return { month: monthAt(at.x, box.width, tips.length), at };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") step({ type: "point", ...pointerIn(event.currentTarget, event) });
  }

  function onSlotClick(event: MouseEvent, month: number) {
    const area = plot.current;
    if (pointerType.current !== "touch" || area === null) return;
    // A first tap shows the month; only a second tap on it lets the link open.
    if (step({ type: "tap", month, at: pointerIn(area, event).at }) === null) event.preventDefault();
  }

  // A tap outside the plot hides the tooltip a tap showed.
  useEffect(() => {
    if (hover.shownBy !== "touch") return undefined;
    const hideOutside = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node && plot.current?.contains(event.target))) setHover(NO_HOVER);
    };
    document.addEventListener("pointerdown", hideOutside);
    return () => document.removeEventListener("pointerdown", hideOutside);
  }, [hover.shownBy]);

  // Place the tooltip once it is drawn and its size is known, before the browser paints it.
  useLayoutEffect(() => {
    const box = tipBox.current;
    const area = plot.current;
    if (box === null || area === null || hover.month === null) return;
    const size = { width: area.clientWidth, height: area.clientHeight };
    const at = hover.at ?? { x: monthCentre(hover.month, size.width, tips.length), y: 0 };
    const { x, y } = tipPlacement(at, { width: box.offsetWidth, height: box.offsetHeight }, size, slack);
    box.style.transform = `translate(${x}px, ${y}px)`;
  }, [hover, tips.length, slack]);

  return (
    <div
      ref={plot}
      data-plot=""
      role="group"
      aria-label={description}
      tabIndex={0}
      className="absolute inset-y-0 inset-x-1"
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") step({ type: "hide" });
      }}
      onKeyDown={(event) => {
        if (!isHoverKey(event.key)) return;
        event.preventDefault();
        pointerType.current = null;
        const open = step({ type: "key", key: event.key });
        const link = open === null ? null : plot.current?.querySelector(`a[data-month="${open}"]`);
        if (link instanceof HTMLElement) link.click();
      }}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) step({ type: "hide" });
      }}
    >
      {children}
      <div className="absolute inset-0 flex">
        {marks.map((mark, month) => {
          const tip = tips[month];
          const slot = {
            "data-month": month,
            "data-active": hover.month === month || undefined,
            className: "group/month relative flex h-full flex-1 justify-center px-[3px]",
          };
          const drawn = (
            <>
              {crosshair && hover.month === month ? <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-axis" /> : null}
              {mark}
            </>
          );
          if (tip?.link === undefined) {
            return (
              <div key={month} {...slot} onClick={(event) => onSlotClick(event, month)}>
                {drawn}
              </div>
            );
          }
          return (
            <Link key={month} href={tip.link.href} tabIndex={-1} aria-label={`${tipText(tip)}. ${tip.link.text}`} {...slot} onClick={(event) => onSlotClick(event, month)}>
              {drawn}
            </Link>
          );
        })}
      </div>
      {shown === undefined || hover.shownBy === null ? null : (
        <div ref={tipBox} className="pointer-events-none absolute top-0 left-0 z-10">
          <ChartTip tip={shown} foot={openingFoot(shown.link, hover.shownBy)} />
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {shown === undefined || hover.shownBy !== "keys" ? "" : tipText(shown)}
      </p>
    </div>
  );
}
