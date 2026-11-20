import { describe, expect, it } from "vitest";
import { isRailCollapsed, RAIL_COOKIE, railCookie } from "./rail-state";

/** The value a browser would send back for the cookie the toggle wrote. */
function sentBack(cookie: string): string | undefined {
  const [pair] = cookie.split(";");
  const [name, value] = (pair ?? "").split("=");
  return name?.trim() === RAIL_COOKIE ? value?.trim() : undefined;
}

describe("the rail's kept choice (ticket 27)", () => {
  it("is collapsed only when the cookie says so; no cookie, or anything else, is expanded", () => {
    expect(isRailCollapsed("collapsed")).toBe(true);
    expect(isRailCollapsed("expanded")).toBe(false);
    expect(isRailCollapsed(undefined)).toBe(false);
    expect(isRailCollapsed("")).toBe(false);
    expect(isRailCollapsed("COLLAPSED; drop table")).toBe(false);
  });

  it.each([true, false])("survives a reload: the cookie written for collapsed=%s reads back the same", (collapsed) => {
    expect(isRailCollapsed(sentBack(railCookie(collapsed)))).toBe(collapsed);
  });

  it("is kept for every page, for a year, and never sent to other sites", () => {
    const attributes = railCookie(true).split(";").slice(1).map((part) => part.trim());
    expect(attributes).toEqual(expect.arrayContaining(["Path=/", "Max-Age=31536000", "SameSite=Lax"]));
  });
});
