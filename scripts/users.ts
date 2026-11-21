/**
 * npm run users -- add <username> <role> [--generate] | list | remove <username>   [--file <path>]
 *
 * Manages the accounts in the users file (ticket 31, ADR 0012): AUTH_USERS_FILE, or --file. `add` asks
 * for the password twice without echo, so it lands in no shell history or log; --generate makes one
 * and prints it once instead. When stdin is not a terminal, the password is read from it, one line
 * per prompt. docs/runbook.md has the server's steps.
 */
import { createInterface } from "node:readline";
import { runUsersCommand } from "../src/auth/users-command";

let piped: AsyncIterator<string> | undefined;

async function readLine(): Promise<string> {
  if (piped === undefined) {
    process.stderr.write("(stdin is not a terminal: reading the password from it)\n");
    piped = createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator]();
  }
  const next = await piped.next();
  process.stderr.write("\n");
  // Windows PowerShell 5.1 starts what it pipes to a program with a byte-order mark; it is never part of a password.
  return next.done ? "" : next.value.replace(/^﻿/, "");
}

/** One line typed in raw mode, so nothing is echoed. Ctrl+C quits; Backspace deletes. */
function readHidden(prompt: string): Promise<string> {
  process.stderr.write(prompt);
  const { stdin } = process;
  if (!stdin.isTTY) return readLine();
  return new Promise((resolve) => {
    let typed: string[] = [];
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(typed.join(""));
          return;
        }
        if (char === "\u0003") {
          finish();
          process.exit(130);
        }
        typed = char === "\u007f" || char === "\b" ? typed.slice(0, -1) : [...typed, char];
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

void runUsersCommand(process.argv.slice(2), {
  readPassword: readHidden,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}).then((code) => process.exit(code));
