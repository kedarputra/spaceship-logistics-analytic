import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashThatMatchesNothing } from "./password";
import { type Role, ROLES } from "./roles";
import { signSession } from "./session";
import { writeAccounts } from "./users";

/**
 * For tests only: a users file in a temporary folder with one account per role, named after its role,
 * and a fresh secret to sign their sessions with. The hashes are random, so no password signs in;
 * a test that signs in hashes its own.
 */
export interface TestAccounts {
  /** AUTH_SECRET and AUTH_USERS_FILE for vi.stubEnv. */
  env: { AUTH_SECRET: string; AUTH_USERS_FILE: string };
  /** A session for `username`, carrying `role` (its own by default). */
  token(username: string, role?: Role, now?: number): string;
  /** The Cookie header of that session. */
  cookie(username: string, role?: Role): string;
  /** Replaces the accounts, as a later save of the file would. */
  write(accounts: { username: string; role: Role; passwordHash?: string }[]): void;
  remove(): void;
}

export function createTestAccounts(): TestAccounts {
  const dir = mkdtempSync(path.join(tmpdir(), "accounts-"));
  const file = path.join(dir, "users.json");
  const key = randomBytes(32);
  let saved = Date.UTC(2026, 10, 21);
  const write: TestAccounts["write"] = (accounts) => {
    writeAccounts(
      file,
      accounts.map(({ username, role, passwordHash }) => ({ username, role, passwordHash: passwordHash ?? hashThatMatchesNothing() })),
    );
    // Each save a minute later, so the app sees a new modification time however fast the test runs.
    saved += 60_000;
    utimesSync(file, new Date(saved), new Date(saved));
  };
  write(ROLES.map((role) => ({ username: role, role })));
  const token: TestAccounts["token"] = (username, role, now = Date.now()) =>
    signSession({ username, role: role ?? (ROLES.find((known) => known === username) ?? "viewer") }, key, now);
  return {
    env: { AUTH_SECRET: key.toString("base64"), AUTH_USERS_FILE: file },
    token,
    cookie: (username, role) => `session=${token(username, role)}`,
    write,
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
