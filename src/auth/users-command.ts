import { existsSync, readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { isUsername, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeUsername, USERNAME_RULE } from "./credentials";
import { hashPassword } from "./password";
import { isRole, ROLE_NAMES, ROLES } from "./roles";
import { type Account, findAccount, parseAccounts, writeAccounts } from "./users";
import { decodeText } from "./text-file";

/**
 * `npm run users -- …` (ticket 31): adds, lists and removes the accounts in the users file. The
 * script in scripts/users.ts supplies the terminal; this is the command itself, so tests can run it
 * on a temporary file. It never prints a hash, and prints a generated password once.
 */

export interface UsersCommandIo {
  /** One password typed without echo. */
  readPassword(prompt: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

/** "viewer, analyst or admin". */
const ROLE_CHOICES = `${ROLES.slice(0, -1).join(", ")} or ${ROLES[ROLES.length - 1]}`;

export const USAGE = [
  "Usage:",
  "  npm run users -- add <username> <role> [--generate]",
  "  npm run users -- list",
  "  npm run users -- remove <username>",
  "",
  "  --file <path>  the users file; AUTH_USERS_FILE when not given",
  "  --generate     make a password and print it once, instead of asking for one",
  "",
  `Roles: ${ROLE_CHOICES}.`,
].join("\n");

/** No i, l, o, 0 or 1, so a password read off a screen is typed right. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Four groups of four: about 79 bits. */
function generatePassword(): string {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");
}

class Refusal extends Error {}

interface Parsed {
  positional: string[];
  file: string | undefined;
  generate: boolean;
}

function parseArgs(args: readonly string[]): Parsed {
  const positional: string[] = [];
  let file: string | undefined;
  let generate = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--file") {
      file = args[index + 1];
      index += 1;
    } else if (arg === "--generate") {
      generate = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, file, generate };
}

/** The accounts in the file, none when it does not exist yet; a file that does not parse is refused. */
function load(file: string): Account[] {
  if (!existsSync(file)) return [];
  const result = parseAccounts(decodeText(readFileSync(file)));
  if (!result.ok) throw new Refusal(`${result.problem}. Nothing was changed.`);
  return [...result.accounts];
}

async function passwordFor(generate: boolean, io: UsersCommandIo): Promise<{ password: string; generated: boolean }> {
  if (generate) return { password: generatePassword(), generated: true };
  const password = await io.readPassword("Password: ");
  const again = await io.readPassword("Password again: ");
  if (password !== again) throw new Refusal("The two passwords differ. Nothing was changed.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new Refusal(`Use at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new Refusal(`Use at most ${MAX_PASSWORD_LENGTH} characters. Nothing was changed.`);
  return { password, generated: false };
}

async function add(file: string, [name = "", role = ""]: string[], generate: boolean, io: UsersCommandIo): Promise<void> {
  const username = normalizeUsername(name);
  if (!isUsername(username)) throw new Refusal(`${USERNAME_RULE}\n\n${USAGE}`);
  if (!isRole(role)) throw new Refusal(`The role must be ${ROLE_CHOICES}.\n\n${USAGE}`);
  const accounts = load(file);
  if (findAccount(accounts, username)) throw new Refusal(`${username} already exists. Remove it first to give it another role or password.`);
  const { password, generated } = await passwordFor(generate, io);
  writeAccounts(file, [...accounts, { username, role, passwordHash: await hashPassword(password) }]);
  io.out(`Added ${username} (${ROLE_NAMES[role]}).`);
  if (generated) io.out(`Password: ${password}`);
}

function list(file: string, io: UsersCommandIo): void {
  const accounts = load(file);
  if (accounts.length === 0) return io.out("No accounts.");
  const width = Math.max(...accounts.map((account) => account.username.length));
  io.out(accounts.map((account) => `${account.username.padEnd(width)}  ${ROLE_NAMES[account.role]}`).join("\n"));
}

function remove(file: string, [name = ""]: string[], io: UsersCommandIo): void {
  const username = normalizeUsername(name);
  const accounts = load(file);
  if (!findAccount(accounts, username)) throw new Refusal(`There is no account ${username}.`);
  writeAccounts(file, accounts.filter((account) => account.username !== username));
  io.out(`Removed ${username}.`);
}

/** The exit code: 0 done, 1 refused, 2 used wrongly. */
export async function runUsersCommand(args: readonly string[], io: UsersCommandIo, env: Record<string, string | undefined> = process.env): Promise<number> {
  const { positional, file: fileFlag, generate } = parseArgs(args);
  const [command, ...rest] = positional;
  if (command !== "add" && command !== "list" && command !== "remove") {
    io.err(USAGE);
    return 2;
  }
  const file = fileFlag?.trim() || env.AUTH_USERS_FILE?.trim();
  if (!file) {
    io.err("Set AUTH_USERS_FILE or pass --file <path>.");
    return 2;
  }
  try {
    if (command === "add") await add(file, rest, generate, io);
    else if (command === "list") list(file, io);
    else remove(file, rest, io);
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    io.err(error.message);
    return 1;
  }
}
