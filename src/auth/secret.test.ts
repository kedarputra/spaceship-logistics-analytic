import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readAuthSecret } from "./secret";

const SECRET = randomBytes(32);
const BASE64 = SECRET.toString("base64");
const FILE = "C:/secrets/auth-secret.txt";

/** A reader that knows one file. */
function files(contents: Record<string, Buffer>) {
  return (path: string): Buffer => {
    const found = contents[path];
    if (found === undefined) throw new Error("ENOENT");
    return found;
  };
}

const noFiles = files({});

describe("the session secret (ticket 31)", () => {
  it("is read from the file AUTH_SECRET_FILE names, trimmed, as base64", () => {
    const result = readAuthSecret({ AUTH_SECRET_FILE: FILE }, files({ [FILE]: Buffer.from(`  ${BASE64}\r\n`) }));
    expect(result).toEqual({ ok: true, key: SECRET });
  });

  it("is read from a file Windows PowerShell 5.1 wrote with `>` (UTF-16 with a byte-order mark)", () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`${BASE64}\r\n`, "utf16le")]);
    expect(readAuthSecret({ AUTH_SECRET_FILE: FILE }, files({ [FILE]: utf16 }))).toEqual({ ok: true, key: SECRET });
    const utf8Bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(BASE64)]);
    expect(readAuthSecret({ AUTH_SECRET_FILE: FILE }, files({ [FILE]: utf8Bom }))).toEqual({ ok: true, key: SECRET });
  });

  it("is taken from AUTH_SECRET when there is no file, for local runs and CI", () => {
    expect(readAuthSecret({ AUTH_SECRET: BASE64 }, noFiles)).toEqual({ ok: true, key: SECRET });
    expect(readAuthSecret({ AUTH_SECRET: SECRET.toString("base64url") }, noFiles)).toEqual({ ok: true, key: SECRET });
  });

  it("refuses both at once, so a stale value never wins unnoticed", () => {
    const result = readAuthSecret({ AUTH_SECRET_FILE: FILE, AUTH_SECRET: BASE64 }, files({ [FILE]: Buffer.from(BASE64) }));
    expect(result).toEqual({ ok: false, problem: "Set AUTH_SECRET_FILE or AUTH_SECRET, not both" });
  });

  it("fails closed when it is missing, unreadable, empty, short or not base64", () => {
    const problem = (env: Record<string, string>, read = noFiles) => {
      const result = readAuthSecret(env, read);
      return result.ok ? "accepted" : result.problem;
    };
    expect(problem({})).toBe("AUTH_SECRET_FILE (or AUTH_SECRET) is not set");
    expect(problem({ AUTH_SECRET_FILE: "  ", AUTH_SECRET: "" })).toBe("AUTH_SECRET_FILE (or AUTH_SECRET) is not set");
    expect(problem({ AUTH_SECRET_FILE: FILE })).toBe("The file AUTH_SECRET_FILE names cannot be read");
    expect(problem({ AUTH_SECRET_FILE: FILE }, files({ [FILE]: Buffer.from(" \n") }))).toBe("The secret file is empty");
    const short = "The secret must be at least 32 random bytes, base64-encoded";
    expect(problem({ AUTH_SECRET: randomBytes(31).toString("base64") })).toBe(short);
    expect(problem({ AUTH_SECRET: "correct horse battery staple, but not base64 at all!" })).toBe(short);
  });

  it("never puts the secret in a problem", () => {
    const short = randomBytes(16).toString("base64");
    const result = readAuthSecret({ AUTH_SECRET: short }, noFiles);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(short);
  });
});
