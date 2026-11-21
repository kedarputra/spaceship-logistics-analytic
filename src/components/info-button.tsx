"use client";

import { type FocusEvent, type KeyboardEvent, type PointerEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons";

const HOVER_DELAY_MS = 150;
/** The least room left between the popover and the window's edge. */
const EDGE_PX = 8;

/**
 * How far to slide a popover that starts at its trigger's left edge so it stays inside the window,
 * and where the trigger's middle is in it, for it to grow from.
 */
function placement(trigger: { left: number; width: number }, width: number, windowWidth: number) {
  const overflow = Math.max(0, trigger.left + width - (windowWidth - EDGE_PX));
  const shift = Math.max(EDGE_PX - trigger.left, -overflow);
  return { shift, origin: trigger.width / 2 - shift };
}

/**
 * An "i" after a card's or chart's title (ticket 30): the words that used to sit under the title, such
 * as its definition, date basis, period and n, one hover, focus or tap away. It opens 150 ms into a
 * hover, on focus and on a tap; a second tap, Escape, a tap outside or leaving closes it. The popover is
 * the chart tooltips' card, kept inside the window, and grows from the button. Like the collapsibles it
 * is a disclosure: the button says whether it is open and which region it opens. Its words stay in the
 * page closed, as the button's description, so a screen reader hears them on focus.
 */
export function InfoButton({ title, lines }: { title: string; lines: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ shift: 0, origin: 12 });
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The last press: a touch toggles, and whether it was open before the press's focus opened it.
  const press = useRef({ touch: false, wasOpen: false });

  function cancelHover() {
    clearTimeout(hoverTimer.current);
  }

  useEffect(() => cancelHover, []);

  // Open, a press anywhere outside closes it.
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: globalThis.PointerEvent) {
      if (!(event.target instanceof Node) || !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useLayoutEffect(() => {
    const anchor = root.current;
    const box = popover.current;
    if (!open || anchor === null || box === null) return;
    const trigger = anchor.getBoundingClientRect();
    setPlace(placement(trigger, box.offsetWidth, document.documentElement.clientWidth));
  }, [open]);

  function hoverIn(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    cancelHover();
    hoverTimer.current = setTimeout(() => setOpen(true), HOVER_DELAY_MS);
  }

  function hoverOut(event: PointerEvent) {
    if (event.pointerType === "touch") return;
    cancelHover();
    setOpen(false);
  }

  function leaveFocus(event: FocusEvent) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  // A key press is no touch, so a following click opens rather than toggles; Escape closes.
  function keyDown(event: KeyboardEvent) {
    press.current.touch = false;
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <span ref={root} onPointerEnter={hoverIn} onPointerLeave={hoverOut} onBlur={leaveFocus} onKeyDown={keyDown} className="relative z-10 -my-1 inline-flex">
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={id}
        onPointerDown={(event) => {
          press.current = { touch: event.pointerType === "touch", wasOpen: open };
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(press.current.touch ? !press.current.wasOpen : true)}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-grey-green hover:text-ink aria-expanded:text-ink"
      >
        <Icon name="info" size={15} strokeWidth={1.9} />
      </button>
      <div
        ref={popover}
        id={id}
        data-info-popover
        data-open={open ? "" : undefined}
        style={{ translate: `${place.shift}px 0`, transformOrigin: `${place.origin}px -6px` }}
        className="popover absolute top-full left-0 mt-1.5 w-max max-w-[min(280px,calc(100vw-16px))] rounded-card [&>p+p]:mt-1 border border-line bg-panel px-3 py-2.5 text-small font-normal tracking-normal text-ink-2 normal-case shadow-raised before:absolute before:inset-x-0 before:-top-2 before:h-2"
      >
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </span>
  );
}
