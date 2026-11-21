import { readFileSync } from "node:fs";

/**
 * A text file as a string, whatever wrote it: UTF-8 with or without a byte-order mark, or the UTF-16
 * that Windows PowerShell 5.1's `>` writes. The secret and the users file are made by hand on the
 * server, so the app reads them the way they are likely to be saved.
 */
export function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString("utf8");
  return bytes.toString("utf8");
}

export function readBytes(path: string): Buffer {
  return readFileSync(path);
}
