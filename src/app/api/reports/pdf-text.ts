import { inflateSync } from "node:zlib";

/**
 * For tests only (ticket 34): what a PDF made by pdfkit says, so a test can read the figures in it. Text
 * in an embedded font is written as glyph codes; each font's ToUnicode map turns them back into text.
 * Enough PDF for pdfkit's own output: objects, Flate streams, Tf, Tj and TJ. Not a general PDF reader.
 */

interface PdfObject {
  dictionary: string;
  stream?: Buffer;
}

/** The end of the dictionary that starts at `start` ("<<"), past its closing ">>". */
function dictionaryEnd(text: string, start: number): number {
  let depth = 0;
  for (let at = start; at < text.length - 1; at += 1) {
    const pair = text.slice(at, at + 2);
    if (pair === "<<") {
      depth += 1;
      at += 1;
    } else if (pair === ">>") {
      depth -= 1;
      at += 1;
      if (depth === 0) return at + 1;
    }
  }
  throw new Error("A dictionary in the PDF never ends");
}

function objects(pdf: Uint8Array): Map<number, PdfObject> {
  const text = Buffer.from(pdf).toString("latin1");
  const found = new Map<number, PdfObject>();
  const header = /(\d+) 0 obj\s*/g;
  for (let match = header.exec(text); match !== null; match = header.exec(text)) {
    const start = match.index + match[0].length;
    if (!text.startsWith("<<", start)) continue;
    const end = dictionaryEnd(text, start);
    const dictionary = text.slice(start, end);
    const opening = /^\s*stream\r?\n/.exec(text.slice(end, end + 16));
    const length = /\/Length (\d+)/.exec(dictionary)?.[1];
    if (opening !== null && length !== undefined) {
      const from = end + opening[0].length;
      const raw = Buffer.from(text.slice(from, from + Number(length)), "latin1");
      found.set(Number(match[1]), { dictionary, stream: dictionary.includes("/FlateDecode") ? inflateSync(raw) : raw });
      header.lastIndex = from + Number(length);
    } else {
      found.set(Number(match[1]), { dictionary });
    }
  }
  return found;
}

/** A ToUnicode map's codes: pdfkit writes ranges of arrays, "<0000> <00ff> [<0041> <0066 0069> …]". */
function toUnicode(cmap: string): Map<number, string> {
  const codes = new Map<number, string>();
  for (const [, first = "0", list = ""] of cmap.matchAll(/<([0-9a-fA-F]+)>\s*<[0-9a-fA-F]+>\s*\[([^\]]*)\]/g)) {
    [...list.matchAll(/<([0-9a-fA-F ]+)>/g)].forEach(([, units = ""], index) => {
      const chars = units.replace(/\s/g, "").match(/.{4}/g) ?? [];
      codes.set(Number.parseInt(first, 16) + index, String.fromCharCode(...chars.map((unit) => Number.parseInt(unit, 16))));
    });
  }
  return codes;
}

/** Each font resource name (F1, F2…) with its codes. */
function fontMaps(all: Map<number, PdfObject>): Map<string, Map<number, string>> {
  const maps = new Map<string, Map<number, string>>();
  for (const { dictionary } of all.values()) {
    for (const [, name = "", id = ""] of dictionary.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const unicodeId = /\/ToUnicode (\d+) 0 R/.exec(all.get(Number(id))?.dictionary ?? "")?.[1];
      const cmap = unicodeId === undefined ? undefined : all.get(Number(unicodeId))?.stream;
      if (cmap !== undefined) maps.set(name, toUnicode(cmap.toString("latin1")));
    }
  }
  return maps;
}

/** The text of one content stream, a line per BT … ET block. */
function streamText(content: string, fonts: Map<string, Map<number, string>>): string[] {
  const lines: string[] = [];
  let codes: Map<number, string> | undefined;
  for (const [block = ""] of content.matchAll(/BT[\s\S]*?ET/g)) {
    let text = "";
    for (const [, font, shown] of block.matchAll(/\/(F\d+) [\d.]+ Tf|(\[[^\]]*\]\s*TJ|<[0-9a-fA-F]*>\s*Tj)/g)) {
      if (font !== undefined) codes = fonts.get(font);
      if (shown === undefined) continue;
      for (const [, hex = ""] of shown.matchAll(/<([0-9a-fA-F]*)>/g)) {
        for (const unit of hex.match(/.{4}/g) ?? []) text += codes?.get(Number.parseInt(unit, 16)) ?? "�";
      }
    }
    lines.push(text);
  }
  return lines;
}

/** Every page's text, in page order, a line per text run. */
export function pdfPages(pdf: Uint8Array): string[][] {
  const all = objects(pdf);
  const fonts = fontMaps(all);
  const pages = [...all.values()].filter(({ dictionary }) => /\/Type \/Page\b(?!s)/.test(dictionary));
  return pages.map(({ dictionary }) => {
    const contents = /\/Contents (\d+) 0 R/.exec(dictionary)?.[1];
    const stream = contents === undefined ? undefined : all.get(Number(contents))?.stream;
    return stream === undefined ? [] : streamText(stream.toString("latin1"), fonts);
  });
}
