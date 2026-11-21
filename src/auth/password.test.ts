import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstNothing, verifyPassword } from "./password";

describe("password hashes (ticket 31)", () => {
  it("verify the password they were made from, and no other", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("are scrypt with a random 16-byte salt and the parameters stored with the hash", async () => {
    const [first, second] = await Promise.all([hashPassword("same password"), hashPassword("same password")]);
    expect(first).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/);
    const salt = first.split("$")[4] ?? "";
    expect(Buffer.from(salt, "base64")).toHaveLength(16);
    expect(second).not.toBe(first);
    expect(first).not.toContain("same password");
  });

  it("refuse a stored value that is not a hash, or asks for absurd parameters, without throwing", async () => {
    const hash = await hashPassword("pw");
    const [, , , , salt, key] = hash.split("$");
    for (const stored of ["", "plain text", `scrypt$1048576000$8$3$${salt}$${key}`, `scrypt$1000$8$3$${salt}$${key}`, `bcrypt$32768$8$3$${salt}$${key}`]) {
      expect(await verifyPassword("pw", stored)).toBe(false);
    }
  });

  it("spend one hash's work on an unknown username, and never match", async () => {
    expect(await verifyAgainstNothing("anything")).toBe(false);
  });
});
