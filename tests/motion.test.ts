import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { durationMs } from "@/components/motion";

// Ticket 30: one motion system, defined once in globals.css as tokens, and nothing moves for a viewer
// who asked for reduced motion.
const css = readFileSync("src/app/globals.css", "utf8");

/** The body of the first block that opens with `opening`, braces matched. */
function block(source: string, opening: string): string {
  const start = source.indexOf(opening);
  if (start === -1) throw new Error(`no block ${opening}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`unclosed block ${opening}`);
}

/** Each custom property the text sets, by name. */
function declarations(source: string): Map<string, string> {
  return new Map([...source.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()]));
}

const theme = declarations(block(css, "@theme {"));
const reduced = block(css, "@media (prefers-reduced-motion: reduce)");

describe("the motion tokens (ticket 30)", () => {
  it("defines the iOS sheet easing and the in-out easing", () => {
    expect(theme.get("--ease-out")).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
    expect(theme.get("--ease-in-out")).toBe("cubic-bezier(0.65, 0, 0.35, 1)");
  });

  it("defines three durations: hover and press, open and close, the rail and large panels", () => {
    expect(theme.get("--dur-1")).toBe("160ms");
    expect(theme.get("--dur-2")).toBe("280ms");
    expect(theme.get("--dur-3")).toBe("380ms");
  });

  it("makes them every transition's default", () => {
    expect(theme.get("--default-transition-duration")).toBe("var(--dur-1)");
    expect(theme.get("--default-transition-timing-function")).toBe("var(--ease-out)");
  });
});

describe("reduced motion (ticket 30)", () => {
  it("turns every duration to 0", () => {
    const durations = [...theme.keys()].filter((name) => /^--dur-\d$/.test(name));
    expect(durations).toEqual(["--dur-1", "--dur-2", "--dur-3"]);
    const zeroed = declarations(reduced);
    for (const name of durations) expect(zeroed.get(name)).toBe("0ms");
  });

  it("drops the shimmer", () => {
    expect(block(reduced, ".shimmer::after")).toMatch(/display:\s*none/);
  });
});

describe("a token's duration in script (ticket 30)", () => {
  it("reads milliseconds and seconds, as the build minifies 280ms to .28s, and 0 for reduced motion", () => {
    expect(durationMs("280ms")).toBe(280);
    expect(durationMs(".28s")).toBe(280);
    expect(durationMs(" 0.16s")).toBe(160);
    expect(durationMs("0s")).toBe(0);
    expect(durationMs("")).toBe(0);
  });
});
