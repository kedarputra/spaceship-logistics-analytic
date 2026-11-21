import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashes (ticket 31, ADR 0012): scrypt from node:crypto, with a random 16-byte salt and the
 * parameters stored with the hash, as `scrypt$N$r$p$<salt>$<key>` (base64). N = 2^15, r = 8, p = 3 is
 * one of OWASP's scrypt settings: about 150 ms and 32 MiB per hash on the server.
 */

const N = 32768;
const R = 8;
const P = 3;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
/** Above Node's default, which N = 2^15 with r = 8 just reaches. */
const MAX_MEMORY = 64 * 1024 * 1024;

interface Parameters {
  n: number;
  r: number;
  p: number;
}

function derive(password: string, salt: Buffer, { n, r, p }: Parameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, KEY_BYTES, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, { n: N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

const STORED = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/;

/** The parameters and salt of a stored hash, if it is one this app could have written. */
function parse(stored: string): { parameters: Parameters; salt: Buffer; key: Buffer } | undefined {
  const match = STORED.exec(stored);
  if (match === null) return undefined;
  const [n, r, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Bounded, so a hand-edited file cannot make one sign-in take seconds or gigabytes.
  const sane = n >= 16384 && n <= 131072 && (n & (n - 1)) === 0 && r >= 1 && r <= 16 && p >= 1 && p <= 8;
  const salt = Buffer.from(match[4] ?? "", "base64");
  const key = Buffer.from(match[5] ?? "", "base64");
  if (!sane || salt.length < SALT_BYTES || key.length !== KEY_BYTES) return undefined;
  return { parameters: { n, r, p }, salt, key };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (parsed === undefined) return false;
  const key = await derive(password, parsed.salt, parsed.parameters);
  return timingSafeEqual(key, parsed.key);
}

/** A hash no password matches, with the same parameters as a real one: random bytes in place of a key. */
export function hashThatMatchesNothing(): string {
  return ["scrypt", N, R, P, randomBytes(SALT_BYTES).toString("base64"), randomBytes(KEY_BYTES).toString("base64")].join("$");
}

const NOTHING = hashThatMatchesNothing();

/**
 * The same work as checking a real account, for a username that has none, so the time a sign-in
 * takes does not tell a wrong username from a wrong password. Always false.
 */
export async function verifyAgainstNothing(password: string): Promise<false> {
  await verifyPassword(password, NOTHING);
  return false;
}
