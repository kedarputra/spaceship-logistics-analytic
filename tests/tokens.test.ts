import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRINT_INK } from "@/components/palette";

// ADR 0011 §1: colours are tokens. Raw hex values live only in the CSS variables of globals.css and in
// the chart marks of palette.ts; components use the token classes. Tailwind's own colours are cleared,
// so a class such as text-slate-600 would draw nothing: none may be used.
const HEX_HOMES = ["src/app/globals.css", "src/components/palette.ts"];
const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;
// Tailwind's colours carry a shade (amber-500); the design's own "amber" token has none.
const DEFAULT_PALETTE =
  /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|decoration|placeholder|shadow|accent|caret)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)\b/g;

function sourceFiles(): { path: string; source: string }[] {
  return readdirSync("src", { recursive: true, encoding: "utf8" })
    .map((entry) => path.posix.join("src", entry.split(path.sep).join("/")))
    .filter((file) => /\.(?:tsx?|css)$/.test(file))
    .map((file) => ({ path: file, source: readFileSync(file, "utf8") }));
}

describe("colours come from the design tokens (ADR 0011 §1, ticket 24)", () => {
  const files = sourceFiles();

  it("has raw hex values only in globals.css and palette.ts", () => {
    const strays = files
      .filter((file) => !HEX_HOMES.includes(file.path))
      .flatMap((file) => [...file.source.matchAll(HEX)].map((match) => `${file.path}: ${match[0]}`));
    expect(strays).toEqual([]);
  });

  it("uses no Tailwind default colour class, which the cleared palette would leave unstyled", () => {
    const strays = files.flatMap((file) => [...file.source.matchAll(DEFAULT_PALETTE)].map((match) => `${file.path}: ${match[0]}`));
    expect(strays).toEqual([]);
  });

  it("names no type size like a colour: text-axis would draw in the axis colour, not at the axis size (ticket 25)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const names = (prefix: string) => new Set([...css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, "g"))].map((match) => match[1]));
    const colours = names("color");
    expect([...names("text")].filter((size) => colours.has(size))).toEqual([]);
  });

  it("keeps the PDF's colours, which pdfkit needs as values, equal to the tokens they copy (ticket 34)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const token = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i").exec(css)?.[1]?.toLowerCase();
    const tokenOf: Record<keyof typeof PRINT_INK, string> = { ink: "ink", muted: "muted", line: "line", grid: "grid", inset: "inset", warnTint: "warn-tint", warnInk: "warn-ink" };
    const copies = Object.entries(tokenOf).map(([key, name]) => [name, PRINT_INK[key as keyof typeof PRINT_INK], token(name)]);
    expect(copies.filter(([, copy, original]) => copy !== original)).toEqual([]);
    expect(copies).toHaveLength(7);
  });

  it("is checked against something: both homes hold the chart marks", () => {
    for (const home of HEX_HOMES) expect(readFileSync(home, "utf8").toLowerCase()).toContain("#2a8763");
  });
});
