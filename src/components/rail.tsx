"use client";

import { type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, useState } from "react";
import { Icon } from "./icons";
import { railCookie } from "./rail-state";

const TIP_GAP_PX = 8;

interface Tip {
  text: string;
  top: number;
  left: number;
}

/** The tooltip for the rail item under the pointer or focus: its data-tip text, beside the rail's edge. */
function tipFor(target: EventTarget, rail: Element): Tip | undefined {
  if (!(target instanceof Element)) return undefined;
  const anchor = target.closest("[data-tip]");
  const text = anchor?.getAttribute("data-tip");
  if (anchor === null || !text) return undefined;
  const box = anchor.getBoundingClientRect();
  return { text, top: box.top + box.height / 2, left: rail.getBoundingClientRect().right + TIP_GAP_PX };
}

/**
 * The collapsed rail's tooltip: one, fixed to the window, so a rail that scrolls in a short window
 * does not clip it. It follows the pointer and keyboard focus from item to item, and Escape, leaving
 * the rail, or scrolling it hides it. The element only shows where the collapsed styles apply.
 */
function useRailTip(collapsed: boolean) {
  const [tip, setTip] = useState<Tip>();
  const hide = () => setTip(undefined);
  const show = (event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) => setTip(collapsed ? tipFor(event.target, event.currentTarget) : undefined);
  const dismiss = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") hide();
  };
  const tooltip =
    tip === undefined ? null : (
      <span
        aria-hidden="true"
        style={{ top: tip.top, left: tip.left }}
        className="pointer-events-none fixed z-50 hidden -translate-y-1/2 rounded-control bg-ink px-2.5 py-1.5 text-small font-medium whitespace-nowrap text-panel shadow-raised rail-collapsed:block"
      >
        {tip.text}
      </span>
    );
  return { tooltip, hide, listeners: { onPointerOver: show, onPointerLeave: hide, onFocus: show, onBlur: hide, onKeyDown: dismiss, onScroll: hide } };
}

/**
 * The rail of the shell (ADR 0011 §5, ticket 27). Beside the page it fills the window's height, stays
 * put while the page scrolls, and collapses to icons. The choice is kept in a cookie, which the
 * layout reads, so the first paint already has the right width. Collapsed, each item with a
 * data-tip shows it on hover and on keyboard focus; the names stay in the markup for screen readers.
 */
export function Rail({
  initiallyCollapsed,
  brand,
  dataCard,
  children,
}: {
  initiallyCollapsed: boolean;
  /** The product mark and name. */
  brand: ReactNode;
  /** The data and AI card at the bottom. */
  dataCard: ReactNode;
  /** The menu. */
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const { tooltip, hide, listeners } = useRailTip(collapsed);
  const toggleName = collapsed ? "Expand menu" : "Collapse menu";

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    hide();
    document.cookie = railCookie(next);
  }

  return (
    <header
      id="rail"
      data-rail-collapsed={collapsed ? "" : undefined}
      {...listeners}
      className="flex flex-col gap-6 bg-rail px-3 py-5 text-rail-ink beside:sticky beside:top-0 beside:z-10 beside:h-dvh beside:w-[232px] beside:shrink-0 beside:overflow-x-hidden beside:overflow-y-auto beside:transition-[width] beside:duration-150 rail-collapsed:w-16"
    >
      {/* Expanded, the toggle sits in the rail's right padding so the product name keeps its full row. */}
      <div className="relative flex flex-col items-center gap-3">
        <div className="w-full">{brand}</div>
        <button
          type="button"
          aria-label={toggleName}
          aria-expanded={!collapsed}
          aria-controls="rail"
          data-tip={toggleName}
          onClick={toggle}
          className="hidden size-8 place-items-center rounded-control text-rail-muted hover:bg-panel/6 hover:text-panel beside:absolute beside:top-1/2 beside:-right-2 beside:grid beside:-translate-y-1/2 rail-collapsed:static rail-collapsed:translate-y-0"
        >
          {/* It points the way the rail will move: left to collapse, right to expand. */}
          <Icon name="chevron" size={16} strokeWidth={2} className={collapsed ? undefined : "rotate-180"} />
        </button>
      </div>
      {children}
      <div className="grow" />
      {dataCard}
      {tooltip}
    </header>
  );
}
