import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The one-way dependency rule of ADR 0004: app/ and components/ → ai/ → tools/ → domain/.
// The dashboard in app/ calls domain/ directly; ai/ never imports domain/; nothing below the
// presentation layer (app/ and components/) imports it, and no one imports app/ (its routes and pages).
// auth/ (sign-in and roles, ADR 0012) stands beside them: it imports nothing else from src/, and only
// the presentation layer imports it, so the data, the tools and the AI never know who is asking.
const LAYERS = ["domain", "tools", "ai", "auth", "components", "app"] as const;
type Layer = (typeof LAYERS)[number];

const MAY_IMPORT: Record<Layer, readonly Layer[]> = {
  domain: ["domain"],
  tools: ["tools", "domain"],
  ai: ["ai", "tools"],
  auth: ["auth"],
  components: ["components", "auth", "ai", "tools", "domain"],
  app: ["app", "components", "auth", "ai", "tools", "domain"],
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

// An image in the repository's assets/ folder (the product's mark) is a file, not a layer: the
// presentation layer may import it, as Next serves imported images from the build.
const ASSET_IMAGE = /^\.\.\/assets\/[^/]+\.(?:png|svg)$/;
const PRESENTATION: readonly Layer[] = ["components", "app"];

// Next's request proxy must sit beside app/, so src/proxy.ts (and its test) belongs to the app layer.
const APP_ROOT_FILES = /^proxy(\.test)?(\.ts)?$/;

function layerOf(pathInSrc: string): Layer | undefined {
  const top = pathInSrc.split("/")[0] ?? "";
  if (APP_ROOT_FILES.test(top)) return "app";
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
      if (ASSET_IMAGE.test(target) && PRESENTATION.includes(from)) continue;
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

  it("treats Next's src/proxy.ts as part of app/: it may import app/, and nothing below may import it", () => {
    expect(findViolations([{ path: "src/proxy.ts", source: 'import { apiRateLimiter } from "@/app/api/rate-limit";' }])).toEqual([]);
    expect(findViolations([{ path: "src/tools/query.ts", source: 'import { proxy } from "@/proxy";' }])).toHaveLength(1);
  });

  it("keeps auth/ apart: it imports nothing else from src/, and the data, tools and AI never import it (ADR 0012)", () => {
    expect(findViolations([{ path: "src/auth/users.ts", source: 'import { getDataset } from "@/domain/orders";' }])).toHaveLength(1);
    expect(findViolations([{ path: "src/ai/interpret.ts", source: 'import { can } from "@/auth/roles";' }])).toHaveLength(1);
    expect(findViolations([{ path: "src/tools/query.ts", source: 'import { can } from "../auth/roles";' }])).toHaveLength(1);
    const allowed = [
      { path: "src/components/rail-nav.tsx", source: 'import { can } from "@/auth/roles";' },
      { path: "src/proxy.ts", source: 'import { verifySession } from "./auth/session";' },
    ];
    expect(findViolations(allowed)).toEqual([]);
  });

  it("flags a file outside the layer folders and an import that leaves src/", () => {
    const files = [
      { path: "src/lib/util.ts", source: "" },
      { path: "src/domain/orders.ts", source: 'import data from "../../data/extra.json";' },
    ];
    expect(findViolations(files)).toHaveLength(2);
  });

  it("lets the presentation layer import an image from assets/, and nothing below it", () => {
    expect(findViolations([{ path: "src/components/brand-mark.tsx", source: 'import mark from "../../assets/wms-mark.png";' }])).toEqual([]);
    expect(findViolations([{ path: "src/domain/orders.ts", source: 'import mark from "../../assets/wms-mark.png";' }])).toHaveLength(1);
    expect(findViolations([{ path: "src/components/x.tsx", source: 'import code from "../../assets/x.ts";' }])).toHaveLength(1);
  });
});
