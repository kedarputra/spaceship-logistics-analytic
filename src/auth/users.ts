import { statSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { normalizeUsername, USERNAME_PATTERN } from "./credentials";
import { type Role, ROLES } from "./roles";
import { decodeText, readBytes } from "./text-file";

/**
 * The accounts (ticket 31, ADR 0012): a JSON file outside the repo, at the path in AUTH_USERS_FILE,
 * holding a list of { username, role, passwordHash }. `npm run users` writes it. The app reads it again
 * whenever its modification time or size changes, so a removed account or a changed role applies on
 * the next request. Anything wrong in it refuses the whole file: nobody signs in until it is fixed.
 */

const accountSchema = z.object({
  username: z.string().regex(USERNAME_PATTERN),
  role: z.enum(ROLES),
  passwordHash: z.string().startsWith("scrypt$"),
});

export type Account = z.infer<typeof accountSchema>;

/** Who is signed in: an account without its hash. */
export interface User {
  username: string;
  role: Role;
}

export type AccountsResult = { ok: true; accounts: readonly Account[] } | { ok: false; problem: string };

type Environment = Record<string, string | undefined>;

/** The user an account signs in as. */
export function userOf({ username, role }: Account): User {
  return { username, role };
}

export function findAccount(accounts: readonly Account[], username: string): Account | undefined {
  const name = normalizeUsername(username);
  return accounts.find((account) => account.username === name);
}

export function parseAccounts(text: string): AccountsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: "The users file is not valid JSON" };
  }
  const accounts = z.array(accountSchema).safeParse(parsed);
  if (!accounts.success) return { ok: false, problem: "The users file has an entry that is not { username, role, passwordHash }" };
  const names = new Set(accounts.data.map((account) => account.username));
  if (names.size !== accounts.data.length) return { ok: false, problem: "The users file names an account twice" };
  return { ok: true, accounts: accounts.data };
}

/** The file as `npm run users` writes it: one account per entry, readable by hand. */
export function formatAccounts(accounts: readonly Account[]): string {
  return `${JSON.stringify(accounts, null, 2)}\n`;
}

/**
 * Writes the file in place rather than replacing it, so the access the service account was granted
 * on it stays.
 */
export function writeAccounts(path: string, accounts: readonly Account[]): void {
  writeFileSync(path, formatAccounts(accounts), { mode: 0o600 });
}

/** Each file as last read, by path, with the modification time and size it had then. */
const cache = new Map<string, { stamp: string; result: AccountsResult }>();

/** The accounts in a file, read again only when its modification time or size has changed. */
export function readAccounts(path: string): AccountsResult {
  let stamp: string;
  let result: AccountsResult;
  try {
    const stats = statSync(path);
    stamp = `${stats.mtimeMs}:${stats.size}`;
    const known = cache.get(path);
    if (known?.stamp === stamp) return known.result;
    result = parseAccounts(decodeText(readBytes(path)));
  } catch {
    return { ok: false, problem: "The file AUTH_USERS_FILE names cannot be read" };
  }
  // A file caught half-written fails to parse; it is not kept, so the next request reads it again.
  if (result.ok) cache.set(path, { stamp, result });
  else cache.delete(path);
  return result;
}

export function accountsFromEnv(env: Environment = process.env): AccountsResult {
  const path = env.AUTH_USERS_FILE?.trim();
  if (!path) return { ok: false, problem: "AUTH_USERS_FILE is not set" };
  return readAccounts(path);
}
