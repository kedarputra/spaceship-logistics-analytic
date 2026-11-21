import { csvRecordCounter } from "@/domain/csv";
import { IMPORT_LIMITS, IMPORT_LIMITS_TEXT } from "@/domain/orders";

/**
 * Reading an uploaded CSV (ticket 35): only into memory, never to disk, and within the import's limits
 * as it arrives.
 *
 * - The upload must say its length, as a browser does for a file. One that says more than 5 MB is
 *   refused before a byte is read.
 * - Reading stops at once if the body runs past the length it gave, or past 20,000 rows under its header.
 * - A body that ends short of its length is refused too. Next's request proxy stops copying a body at its
 *   own limit (next.config.ts), so a cut-off upload can never pass for a whole file.
 *
 * The bytes are read as UTF-8, and a byte-order mark is dropped.
 */

export const TOO_LARGE = `The file is over ${IMPORT_LIMITS_TEXT.bytes}. An import is ${IMPORT_LIMITS_TEXT.both}.`;
export const TOO_MANY_ROWS = `The file has more than ${IMPORT_LIMITS_TEXT.rows}. An import is ${IMPORT_LIMITS_TEXT.both}.`;
export const NOT_UTF8 = "The file is not UTF-8 text. Save it as CSV UTF-8 and try again.";
export const NO_LENGTH = "Send the file itself, with its length.";
export const WRONG_LENGTH = "The upload was not the length it gave. Try again.";

export type UploadRead = { ok: true; text: string; bytes: number } | { ok: false; status: 400 | 411 | 413; error: string };

export async function readCsvUpload(request: Request): Promise<UploadRead> {
  const length = request.headers.get("content-length");
  if (length === null || !/^\d+$/.test(length) || request.body === null) return { ok: false, status: 411, error: NO_LENGTH };
  const declared = Number(length);
  if (declared > IMPORT_LIMITS.bytes) return { ok: false, status: 413, error: TOO_LARGE };

  const reader = request.body.getReader();
  // fatal: a byte sequence that is not UTF-8 is an error, not a replacement character; the BOM is dropped.
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const records = csvRecordCounter();
  const parts: string[] = [];
  let bytes = 0;
  const stop = async (status: 400 | 413, error: string): Promise<UploadRead> => {
    await reader.cancel();
    return { ok: false, status, error };
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > declared) return stop(400, WRONG_LENGTH);
    let piece: string;
    try {
      piece = decoder.decode(value, { stream: true });
    } catch {
      return stop(400, NOT_UTF8);
    }
    // The header is one record more than the rows.
    if (records.push(piece) > IMPORT_LIMITS.rows + 1) return stop(413, TOO_MANY_ROWS);
    parts.push(piece);
  }
  if (bytes !== declared) return { ok: false, status: 400, error: WRONG_LENGTH };
  try {
    parts.push(decoder.decode());
  } catch {
    return { ok: false, status: 400, error: NOT_UTF8 };
  }
  return { ok: true, text: parts.join(""), bytes };
}
