import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authConfigured, requireRole } from "./access";
import { createTestAccounts } from "./testing";

const accounts = createTestAccounts();
afterAll(() => accounts.remove());

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
  vi.stubEnv("AUTH_SECRET_FILE", "");
  vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
  accounts.write([
    { username: "viewer", role: "viewer" },
    { username: "analyst", role: "analyst" },
    { username: "admin", role: "admin" },
  ]);
});

describe("requireRole (ticket 31)", () => {
  it("allows a signed-in account what its role may do, and says who it is", () => {
    expect(requireRole(accounts.token("analyst"), "ask")).toEqual({ kind: "allowed", user: { username: "analyst", role: "analyst" } });
  });

  it("forbids what the role may not do, with the 403 page's sentence", () => {
    expect(requireRole(accounts.token("viewer"), "ask")).toEqual({
      kind: "forbidden",
      user: { username: "viewer", role: "viewer" },
      message: "Your role, Viewer, can't open Ask the data.",
    });
  });

  it("reads the role from the users file, not the cookie, so a changed role applies on the next request", () => {
    const token = accounts.token("viewer");
    expect(requireRole(token, "ask").kind).toBe("forbidden");
    accounts.write([{ username: "viewer", role: "analyst" }]);
    expect(requireRole(token, "ask")).toEqual({ kind: "allowed", user: { username: "viewer", role: "analyst" } });
    // A cookie that claims more than the file gives is held to the file.
    expect(requireRole(accounts.token("viewer", "admin"), "users").kind).toBe("forbidden");
  });

  it("signs out a removed account on its next request, though its cookie is still valid", () => {
    const token = accounts.token("analyst");
    accounts.write([{ username: "viewer", role: "viewer" }]);
    expect(requireRole(token, "dashboards")).toEqual({ kind: "signed-out" });
  });

  it("signs out no cookie, a tampered one and an expired one", () => {
    expect(requireRole(undefined, "dashboards")).toEqual({ kind: "signed-out" });
    expect(requireRole(`${accounts.token("admin")}x`, "dashboards")).toEqual({ kind: "signed-out" });
    expect(requireRole(accounts.token("admin", "admin", Date.now() - 9 * 60 * 60 * 1000), "dashboards")).toEqual({ kind: "signed-out" });
  });

  it("fails closed without a usable secret or users file", () => {
    const token = accounts.token("admin");
    vi.stubEnv("AUTH_SECRET", "too short");
    expect(requireRole(token, "dashboards")).toEqual({ kind: "not-configured" });
    expect(authConfigured()).toBe(false);
    vi.stubEnv("AUTH_SECRET", accounts.env.AUTH_SECRET);
    vi.stubEnv("AUTH_USERS_FILE", `${accounts.env.AUTH_USERS_FILE}.missing`);
    expect(requireRole(token, "dashboards")).toEqual({ kind: "not-configured" });
    expect(authConfigured()).toBe(false);
    vi.stubEnv("AUTH_USERS_FILE", accounts.env.AUTH_USERS_FILE);
    expect(authConfigured()).toBe(true);
  });
});
