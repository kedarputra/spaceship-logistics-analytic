import { describe, expect, it } from "vitest";
import { type HoverEvent, type HoverState, hoverStep, isHoverKey, monthAt, monthCentre, NO_HOVER, tipPlacement } from "./chart-hover";

const MONTHS = 12;

/** The state after a run of events from nothing shown, and the months each event opened. */
function after(events: HoverEvent[]): { state: HoverState; opened: number[] } {
  let state = NO_HOVER;
  const opened: number[] = [];
  for (const event of events) {
    const next = hoverStep(state, event, MONTHS);
    state = next.state;
    if (next.open !== null) opened.push(next.open);
  }
  return { state, opened };
}

const key = (name: string): HoverEvent => ({ type: "key", key: name });
const at = { x: 10, y: 20 };

describe("the arrow keys move the tooltip from month to month (ticket 26)", () => {
  it("Right shows the first month, then each next one, and stops at the last", () => {
    expect(after([key("ArrowRight")]).state).toEqual({ month: 0, at: null, shownBy: "keys" });
    expect(after([key("ArrowRight"), key("ArrowRight"), key("ArrowRight")]).state.month).toBe(2);
    expect(after(Array.from({ length: 15 }, () => key("ArrowRight"))).state.month).toBe(11);
  });

  it("Left shows the last month, then each one before, and stops at the first", () => {
    expect(after([key("ArrowLeft")]).state.month).toBe(11);
    expect(after([key("ArrowRight"), key("ArrowRight"), key("ArrowLeft")]).state.month).toBe(0);
    expect(after([key("ArrowRight"), key("ArrowLeft")]).state.month).toBe(0);
  });

  it("moves on from the month the mouse showed", () => {
    expect(after([{ type: "point", month: 5, at }, key("ArrowRight")]).state).toEqual({ month: 6, at: null, shownBy: "keys" });
  });

  it("Enter opens the month shown, and nothing when none is", () => {
    expect(after([key("ArrowRight"), key("ArrowRight"), key("Enter")]).opened).toEqual([1]);
    expect(after([key("Enter")]).opened).toEqual([]);
  });

  it("Escape hides it, as leaving the plot does", () => {
    expect(after([key("ArrowRight"), key("Escape")]).state).toEqual(NO_HOVER);
    expect(after([{ type: "point", month: 3, at }, { type: "hide" }]).state).toEqual(NO_HOVER);
  });

  it("answers only its own keys, leaving Tab and the rest to the browser", () => {
    expect(["ArrowLeft", "ArrowRight", "Enter", "Escape"].every(isHoverKey)).toBe(true);
    expect(["Tab", "ArrowUp", " ", "a"].some(isHoverKey)).toBe(false);
    expect(after([key("ArrowRight"), key("Tab")]).state.month).toBe(0);
  });
});

describe("on touch, a first tap shows a month and a second opens it (ticket 26)", () => {
  it("a first tap shows the month without opening it", () => {
    expect(after([{ type: "tap", month: 4, at }])).toEqual({ state: { month: 4, at, shownBy: "touch" }, opened: [] });
  });

  it("a second tap on the same month opens it", () => {
    expect(after([{ type: "tap", month: 4, at }, { type: "tap", month: 4, at }]).opened).toEqual([4]);
  });

  it("a tap on another month shows that one instead", () => {
    expect(after([{ type: "tap", month: 4, at }, { type: "tap", month: 7, at }])).toEqual({ state: { month: 7, at, shownBy: "touch" }, opened: [] });
  });

  it("a tap after the mouse or the keys showed the month only shows it", () => {
    expect(after([{ type: "point", month: 4, at }, { type: "tap", month: 4, at }]).opened).toEqual([]);
    expect(after([key("ArrowRight"), { type: "tap", month: 0, at }]).opened).toEqual([]);
  });

  it("a tap outside hides it", () => {
    expect(after([{ type: "tap", month: 4, at }, { type: "hide" }]).state).toEqual(NO_HOVER);
  });
});

describe("a point picks the nearest month, the whole height and width of its slot (ticket 26)", () => {
  it("splits the plot into equal slots, the gaps included", () => {
    // 12 months over 600 px: 50 px each.
    expect(monthAt(0, 600, 12)).toBe(0);
    expect(monthAt(49.9, 600, 12)).toBe(0);
    expect(monthAt(50, 600, 12)).toBe(1);
    expect(monthAt(599, 600, 12)).toBe(11);
  });

  it("keeps a point just past either side to the month at that end, and a plot not laid out yet to the first", () => {
    expect(monthAt(-3, 600, 12)).toBe(0);
    expect(monthAt(600, 600, 12)).toBe(11);
    expect(monthAt(10, 0, 12)).toBe(0);
  });

  it("puts a month shown by the keys at its slot's centre", () => {
    expect(monthCentre(0, 600, 12)).toBe(25);
    expect(monthCentre(11, 600, 12)).toBe(575);
  });
});

describe("the tooltip follows the pointer and stays inside the card (ticket 26)", () => {
  const plot = { width: 600, height: 210 };
  const tip = { width: 160, height: 90 };
  const slack = { left: 38, right: 4 };

  it("sits right of and below the pointer", () => {
    expect(tipPlacement({ x: 100, y: 40 }, tip, plot, slack)).toEqual({ x: 112, y: 52 });
  });

  it("flips to the pointer's left near the right edge", () => {
    expect(tipPlacement({ x: 500, y: 40 }, tip, plot, slack)).toEqual({ x: 328, y: 52 });
  });

  it("keeps within the plot's height", () => {
    expect(tipPlacement({ x: 100, y: 200 }, tip, plot, slack).y).toBe(120);
  });

  it("on a narrow chart, keeps within the card where neither side has room", () => {
    // 320 px wide screen: about 206 px of plot.
    const narrow = { width: 206, height: 210 };
    // Too wide for the right: flipped left and stopped at the card's edge, over the tick labels.
    expect(tipPlacement({ x: 100, y: 0 }, tip, narrow, slack)).toEqual({ x: -38, y: 12 });
    expect(tipPlacement({ x: 30, y: 0 }, tip, narrow, slack).x).toBe(42);
    expect(tipPlacement({ x: 120, y: 0 }, { width: 200, height: 90 }, narrow, slack).x).toBe(-38);
  });
});
