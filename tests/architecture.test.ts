import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The one-way dependency rule of ADR 0004: app/ and components/ → ai/ → tools/ → domain/.
// The dashboard in app/ calls domain/ directly; ai/ never imports domain/; nothing below the
// presentation layer (app/ and components/) imports it, and no one imports app/ (its routes and pages).
const LAYERS = ["domain", "tools", "ai", "components", "app"] as const;
type Layer = (typeof LAYERS)[number];

const MAY_IMPORT: Record<Layer, readonly Layer[]> = {
  domain: ["domain"],
  tools: ["tools", "domain"],
  ai: ["ai", "tools"],
  components: ["components", "ai", "tools", "domain"],
  app: ["app", "components", "ai", "tools", "domain"],
};

const CODE_FILE = /\.[cm]?[jt]sx?$/;

const IMPORT_PATTERNS = [
  /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/g,
];

interface SourceFile {
  path: string;
  source: string;
}

function importSpecifiers(source: string): string[] {
  return IMPORT_PATTERNS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1] ?? ""));
}

function layerOf(pathInSrc: string): Layer | undefined {
  const top = pathInSrc.split("/")[0];
  return LAYERS.find((layer) => layer === top);
}

// The import target as a path inside src/ ("../x" when it points outside), or undefined for a package.
function targetInSrc(filePath: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (!specifier.startsWith(".")) return undefined;
  return path.posix.relative("src", path.posix.join(path.posix.dirname(filePath), specifier));
}

function findViolations(files: readonly SourceFile[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const from = layerOf(path.posix.relative("src", file.path));
    if (from === undefined) {
      violations.push(`${file.path} is not inside a layer folder (${LAYERS.join(", ")})`);
      continue;
    }
    for (const specifier of importSpecifiers(file.source)) {
      const target = targetInSrc(file.path, specifier);
      if (target === undefined) continue;
      const to = layerOf(target);
      if (to === undefined) {
        violations.push(`${file.path} imports "${specifier}", which is outside the layer folders`);
      } else if (!MAY_IMPORT[from].includes(to)) {
        violations.push(`${file.path} imports "${specifier}": ${from}/ may import only ${MAY_IMPORT[from].join(", ")}`);
      }
    }
  }
  return violations;
}

function readSourceTree(root: string): SourceFile[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((entry) => path.posix.join(root, entry.split(path.sep).join("/")))
    .filter((file) => CODE_FILE.test(file))
    .map((file) => ({ path: file, source: readFileSync(file, "utf8") }));
}

describe("dependency rule (ADR 0004)", () => {
  it("holds for every file in src/", () => {
    const files = readSourceTree("src");
    expect(files.map((file) => file.path)).toContain("src/domain/orders.ts");
    expect(findViolations(files)).toEqual([]);
  });

  it("flags domain/ importing the AI layer", () => {
    const files = [{ path: "src/domain/orders.ts", source: 'import { interpret } from "../ai/interpret";' }];
    expect(findViolations(files)).toEqual([
      'src/domain/orders.ts imports "../ai/interpret": domain/ may import only domain',
    ]);
  });

  it("flags ai/ importing domain/, which it must reach through tools/", () => {
    const files = [{ path: "src/ai/interpret.ts", source: 'import type { Order } from "@/domain/orders";' }];
    expect(findViolations(files)).toHaveLength(1);
  });

  it("flags tools/ importing app/ or components/", () => {
    const files = [
      { path: "src/tools/query.ts", source: 'import Page from "@/app/page";' },
      { path: "src/tools/forecast.ts", source: 'export { KpiCard } from "../components/kpi-card";' },
    ];
    expect(findViolations(files)).toHaveLength(2);
  });

  it("finds multi-line, side-effect, and dynamic imports", () => {
    const source = [
      "import {",
      "  interpret,",
      "  phrase,",
      '} from "../ai/interpret";',
      'import "../tools/register";',
      'const lazy = () => import("../app/page");',
    ].join("\n");
    expect(findViolations([{ path: "src/domain/periods.ts", source }])).toHaveLength(3);
  });

  it("allows every edge the rule permits, and package imports", () => {
    const files = [
      { path: "src/app/page.tsx", source: 'import { getDataset } from "@/domain/orders";\nimport "./globals.css";' },
      { path: "src/app/api/ask/route.ts", source: 'import { interpret } from "../../../ai/interpret";' },
      { path: "src/components/kpi-grid.tsx", source: 'import { KpiCard } from "./kpi-card";' },
      { path: "src/ai/interpret.ts", source: 'import { querySpec } from "@/tools/spec";\nimport { z } from "zod";' },
      { path: "src/tools/query.ts", source: 'import { readFileSync } from "node:fs";\nimport { getDataset } from "../domain/orders";' },
    ];
    expect(findViolations(files)).toEqual([]);
  });

  it("flags a file outside the layer folders and an import that leaves src/", () => {
    const files = [
      { path: "src/lib/util.ts", source: "" },
      { path: "src/domain/orders.ts", source: 'import data from "../../data/extra.json";' },
    ];
    expect(findViolations(files)).toHaveLength(2);
  });
});
