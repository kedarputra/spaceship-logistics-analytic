import { describe, expect, it } from "vitest";
import { ACTIONS, can, deniedMessage, isRole, ROLES } from "./roles";

describe("the roles matrix (ticket 31)", () => {
  // The ticket's table, row by row: Viewer, Analyst, Admin.
  const TABLE = {
    dashboards: [true, true, true],
    ask: [false, true, true],
    download: [false, true, true],
    import: [false, false, true],
    users: [false, false, true],
  } as const;

  it.each(ACTIONS)("allows %s to exactly the roles the ticket's table names", (action) => {
    expect(ROLES.map((role) => can(role, action))).toEqual(TABLE[action]);
  });

  it("knows only the three roles", () => {
    expect(ROLES).toEqual(["viewer", "analyst", "admin"]);
    expect(isRole("analyst")).toBe(true);
    expect(isRole("Admin")).toBe(false);
    expect(isRole("root")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("says what a role cannot do in the words of the 403 page", () => {
    expect(deniedMessage("viewer", "ask")).toBe("Your role, Viewer, can't open Ask the data.");
    expect(deniedMessage("analyst", "users")).toBe("Your role, Analyst, can't open Users.");
    expect(deniedMessage("viewer", "download")).toBe("Your role, Viewer, can't download data.");
  });
});
