import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeUsername } from "./credentials";
import { accountsFromEnv, findAccount, parseAccounts, readAccounts } from "./users";

const HASH = `scrypt$32768$8$3$${Buffer.alloc(16, 1).toString("base64")}$${Buffer.alloc(32, 2).toString("base64")}`;

const entry = (username: string, role: string) => ({ username, role, passwordHash: HASH });

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "users-"));
  file = path.join(dir, "users.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Writes the file and moves its modification time on, as a later save would. */
function save(entries: object[], secondsLater: number): void {
  writeFileSync(file, JSON.stringify(entries));
  const when = new Date(Date.UTC(2026, 10, 21) + secondsLater * 1000);
  utimesSync(file, when, when);
}

describe("the users file (ticket 31)", () => {
  it("is a JSON list of { username, role, passwordHash }", () => {
    const result = parseAccounts(JSON.stringify([entry("dina", "analyst"), entry("budi", "viewer")]));
    expect(result).toEqual({ ok: true, accounts: [entry("dina", "analyst"), entry("budi", "viewer")] });
  });

  it("is refused whole when any entry is wrong: not JSON, an unknown role, a bad name, a missing hash, a name twice", () => {
    const problem = (text: string) => {
      const result = parseAccounts(text);
      return result.ok ? "accepted" : result.problem;
    };
    expect(problem("{ not json")).toBe("The users file is not valid JSON");
    expect(problem(JSON.stringify([entry("dina", "root")]))).toBe("The users file has an entry that is not { username, role, passwordHash }");
    expect(problem(JSON.stringify([entry("Dina Sari", "viewer")]))).toBe("The users file has an entry that is not { username, role, passwordHash }");
    expect(problem(JSON.stringify([{ username: "dina", role: "viewer" }]))).toBe("The users file has an entry that is not { username, role, passwordHash }");
    expect(problem(JSON.stringify([entry("dina", "viewer"), entry("dina", "admin")]))).toBe("The users file names an account twice");
  });

  it("is read again when its modification time changes, so a changed role or a removed account applies on the next read", () => {
    save([entry("dina", "viewer"), entry("budi", "analyst")], 0);
    const first = readAccounts(file);
    expect(first.ok && findAccount(first.accounts, "dina")?.role).toBe("viewer");

    save([entry("dina", "admin")], 60);
    const second = readAccounts(file);
    expect(second.ok && findAccount(second.accounts, "dina")?.role).toBe("admin");
    expect(second.ok && findAccount(second.accounts, "budi")).toBeUndefined();
  });

  it("fails closed when the file is missing, unreadable or broken, and recovers once it is fixed", () => {
    expect(readAccounts(file)).toEqual({ ok: false, problem: "The file AUTH_USERS_FILE names cannot be read" });
    save([], 0);
    writeFileSync(file, "[{");
    expect(readAccounts(file).ok).toBe(false);
    save([entry("dina", "viewer")], 120);
    expect(readAccounts(file).ok).toBe(true);
  });

  it("is found through AUTH_USERS_FILE, and without it nobody can sign in", () => {
    save([entry("dina", "viewer")], 0);
    expect(accountsFromEnv({ AUTH_USERS_FILE: file })).toEqual({ ok: true, accounts: [entry("dina", "viewer")] });
    expect(accountsFromEnv({})).toEqual({ ok: false, problem: "AUTH_USERS_FILE is not set" });
  });

  it("matches usernames whatever their case or surrounding spaces", () => {
    expect(normalizeUsername("  Dina ")).toBe("dina");
    expect(findAccount([{ username: "dina", role: "viewer", passwordHash: HASH }], " DINA")?.username).toBe("dina");
  });
});
