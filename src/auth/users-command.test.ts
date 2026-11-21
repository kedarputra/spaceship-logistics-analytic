import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCredentials } from "./sign-in";
import { runUsersCommand } from "./users-command";
import { readAccounts } from "./users";

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "users-cli-"));
  file = path.join(dir, "users.json");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs the command with typed passwords, collecting what it prints. */
async function run(args: string[], typed: string[] = [], env: Record<string, string> = { AUTH_USERS_FILE: "" }) {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  const answers = [...typed];
  const code = await runUsersCommand(
    args,
    {
      readPassword: async (prompt) => {
        prompts.push(prompt);
        return answers.shift() ?? "";
      },
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    },
    env,
  );
  return { code, out: out.join("\n"), err: err.join("\n"), prompts };
}

async function signIn(username: string, password: string) {
  const accounts = readAccounts(file);
  if (!accounts.ok) throw new Error(accounts.problem);
  return checkCredentials(accounts.accounts, username, password);
}

describe("npm run users (ticket 31)", () => {
  it("adds an account with a password asked twice, which then signs in with its role", async () => {
    const added = await run(["add", "Dina", "analyst", "--file", file], ["a long enough password", "a long enough password"]);
    expect(added).toMatchObject({ code: 0, out: "Added dina (Analyst).", prompts: ["Password: ", "Password again: "] });
    expect(await signIn("dina", "a long enough password")).toEqual({ username: "dina", role: "analyst" });
    expect(await signIn("dina", "a wrong password")).toBeUndefined();
  });

  it("generates a password with --generate and prints it once, without asking", async () => {
    const added = await run(["add", "budi", "viewer", "--generate", "--file", file]);
    expect(added.code).toBe(0);
    expect(added.prompts).toEqual([]);
    const password = /^Password: (\S+)$/m.exec(added.out)?.[1] ?? "";
    expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(added.out.split(password)).toHaveLength(2);
    expect(await signIn("budi", password)).toEqual({ username: "budi", role: "viewer" });
  });

  it("takes the file from AUTH_USERS_FILE when --file is not given", async () => {
    expect((await run(["add", "rani", "admin", "--generate"], [], { AUTH_USERS_FILE: file })).code).toBe(0);
    expect((await run(["list"], [], { AUTH_USERS_FILE: file })).out).toBe("rani  Admin");
  });

  it("lists usernames and roles, never a hash", async () => {
    await run(["add", "dina", "analyst", "--generate", "--file", file]);
    await run(["add", "budi", "viewer", "--generate", "--file", file]);
    const listed = await run(["list", "--file", file]);
    expect(listed.out).toBe("dina  Analyst\nbudi  Viewer");
    expect(listed.out).not.toContain("scrypt");
    expect(readFileSync(file, "utf8")).toContain("scrypt$");
  });

  it("removes an account, which then cannot sign in", async () => {
    const added = await run(["add", "dina", "analyst", "--generate", "--file", file]);
    const password = /^Password: (\S+)$/m.exec(added.out)?.[1] ?? "";
    expect(await run(["remove", "DINA", "--file", file])).toMatchObject({ code: 0, out: "Removed dina." });
    expect(await signIn("dina", password)).toBeUndefined();
    expect((await run(["list", "--file", file])).out).toBe("No accounts.");
  });

  it("refuses passwords that differ or are short, and leaves the file as it was", async () => {
    expect(await run(["add", "dina", "analyst", "--file", file], ["a long enough password", "another long password"])).toMatchObject({ code: 1, err: "The two passwords differ. Nothing was changed." });
    expect(await run(["add", "dina", "analyst", "--file", file], ["short", "short"])).toMatchObject({ code: 1, err: "Use at least 12 characters. Nothing was changed." });
    expect(existsSync(file)).toBe(false);
  });

  it("refuses an existing name, an unknown role, a bad name and an unknown account", async () => {
    await run(["add", "dina", "analyst", "--generate", "--file", file]);
    expect((await run(["add", "dina", "admin", "--generate", "--file", file])).err).toBe("dina already exists. Remove it first to give it another role or password.");
    expect((await run(["add", "rani", "root", "--generate", "--file", file])).err).toContain("The role must be viewer, analyst or admin.");
    expect((await run(["add", "Dina Sari", "viewer", "--generate", "--file", file])).err).toContain("A username is up to 32 lower case letters, digits, dots, dashes or underscores.");
    expect(await run(["remove", "nobody", "--file", file])).toMatchObject({ code: 1, err: "There is no account nobody." });
  });

  it("never writes over a users file it cannot read", async () => {
    writeFileSync(file, "[{ broken");
    const added = await run(["add", "dina", "analyst", "--generate", "--file", file]);
    expect(added).toMatchObject({ code: 1, err: "The users file is not valid JSON. Nothing was changed." });
    expect(readFileSync(file, "utf8")).toBe("[{ broken");
  });

  it("needs a file, and explains itself without a command", async () => {
    expect(await run(["list"])).toMatchObject({ code: 2, err: "Set AUTH_USERS_FILE or pass --file <path>." });
    const usage = await run([]);
    expect(usage.code).toBe(2);
    expect(usage.err).toContain("npm run users -- add <username> <role> [--generate]");
  });
});
