/**
 * The hover layer of the hand-drawn month charts (ticket 26), as pure functions: which month a pointer,
 * a tap or a key picks, when a tap opens a month, and where the tooltip goes. No imports, so the
 * browser can use it.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** What shows a month: a mouse or pen over it, a finger on it, or the arrow keys. */
export type HoverInput = "pointer" | "touch" | "keys";

/** How far past the plot's left and right sides the tooltip may go and stay inside the card, in px. */
export interface Slack {
  left: number;
  right: number;
}

/** The index of the month whose tooltip shows, where the pointer is (none for keys), and what showed it. */
export interface HoverState {
  month: number | null;
  at: Point | null;
  shownBy: HoverInput | null;
}

export const NO_HOVER: HoverState = { month: null, at: null, shownBy: null };

export type HoverEvent =
  /** A mouse or pen over a month. */
  | { type: "point"; month: number; at: Point }
  /** A finger lifted on a month. */
  | { type: "tap"; month: number; at: Point }
  | { type: "key"; key: string }
  /** The pointer or the focus left the plot, or a tap landed outside it. */
  | { type: "hide" };

/** The keys the plot answers; others are left to the browser. */
const KEYS = ["ArrowLeft", "ArrowRight", "Enter", "Escape"];

export function isHoverKey(key: string): boolean {
  return KEYS.includes(key);
}

/**
 * The state after an event, and the index of the month whose orders to open, if any. A tap shows a
 * month; a second tap on the month it shows opens it. The arrows move from month to month and stop
 * at the ends; Enter opens the month shown; Escape hides it.
 */
export function hoverStep(state: HoverState, event: HoverEvent, months: number): { state: HoverState; open: number | null } {
  switch (event.type) {
    case "point":
      return { state: { month: event.month, at: event.at, shownBy: "pointer" }, open: null };
    case "tap":
      if (state.shownBy === "touch" && state.month === event.month) return { state, open: event.month };
      return { state: { month: event.month, at: event.at, shownBy: "touch" }, open: null };
    case "hide":
      return { state: NO_HOVER, open: null };
    case "key":
      return keyStep(state, event.key, months);
  }
}

function keyStep(state: HoverState, key: string, months: number): { state: HoverState; open: number | null } {
  const { month } = state;
  if (key === "Escape") return { state: NO_HOVER, open: null };
  if (key === "Enter") return { state, open: month };
  if (key === "ArrowRight") return { state: { month: month === null ? 0 : Math.min(months - 1, month + 1), at: null, shownBy: "keys" }, open: null };
  if (key === "ArrowLeft") return { state: { month: month === null ? months - 1 : Math.max(0, month - 1), at: null, shownBy: "keys" }, open: null };
  return { state, open: null };
}

/** The index of the month under a point `x` across a plot `width` wide, its months side by side: the nearest month's centre. */
export function monthAt(x: number, width: number, months: number): number {
  if (width <= 0) return 0;
  return Math.min(months - 1, Math.max(0, Math.floor((x / width) * months)));
}

/** The centre of a month, for a tooltip shown by the keys. */
export function monthCentre(month: number, width: number, months: number): number {
  if (months <= 0) return 0;
  return ((month + 0.5) / months) * width;
}

/** The space between the pointer and the tooltip, in px. */
const TIP_GAP = 12;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/**
 * The tooltip's top left in the plot: right of and below the point, or left of it where it would pass
 * the right edge. It stays within the plot's height, and at most `slack` past its sides, which keeps
 * it inside the card.
 */
export function tipPlacement(at: Point, tip: Size, plot: Size, slack: Slack): Point {
  const toRight = at.x + TIP_GAP;
  const x = toRight + tip.width <= plot.width + slack.right ? toRight : at.x - TIP_GAP - tip.width;
  return { x: clamp(x, -slack.left, plot.width + slack.right - tip.width), y: clamp(at.y + TIP_GAP, 0, plot.height - tip.height) };
}
