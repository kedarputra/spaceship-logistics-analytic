import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Ticket 19: the README is part of the submission (R12, R14). These checks keep the parts that
// other documents fix, or that must never appear, from drifting as the README is edited.
const readme = readFileSync("README.md", "utf8");

/** The text under a "## " heading, up to the next one; undefined when the heading is missing. */
function section(heading: string): string | undefined {
  const parts = readme.split(/^## /m);
  const found = parts.find((part) => part.split("\n", 1)[0]?.trim() === heading);
  return found?.slice(heading.length).trim();
}

/** ADR 0010 §9: the README carries this sentence word for word. */
function hostingSentence(): string {
  const adr = readFileSync("docs/adr/0010-self-hosted-deployment.md", "utf8");
  const sentence = /worded exactly: "([^"]+)"/.exec(adr)?.[1];
  if (sentence === undefined) throw new Error("ADR 0010 §9 no longer quotes the hosting sentence");
  return sentence;
}

/** The variables .env.example documents, set or commented out. */
function environmentVariables(): string[] {
  const example = readFileSync(".env.example", "utf8");
  return [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1] ?? "");
}

// R12's items, the supported questions ADR 0006 asks for, the deployment, and the AI usage of R14.
const SECTIONS = [
  "Setup",
  "Deployment",
  "Architecture",
  "AI approach",
  "Supported questions",
  "Data definitions",
  "Assumptions and simplifications",
  "Limitations and unsupported queries",
  "Future improvements",
  "AI usage",
];

describe("README.md", () => {
  it("keeps the hosting sentence of ADR 0010 word for word in the deployment section", () => {
    expect(section("Deployment")).toContain(hostingSentence());
  });

  it("names every environment variable of .env.example in the setup section", () => {
    const variables = environmentVariables();
    expect(variables).toContain("LLM_API_KEY_FILE");
    const setup = section("Setup") ?? "";
    // As code, so LLM_MODEL_DISPLAY_NAME does not count as naming LLM_MODEL.
    expect(variables.filter((variable) => !setup.includes(`\`${variable}\``))).toEqual([]);
  });

  it("names the runtime model, its temperature and the absence of a third-party provider in the AI usage section (ADR 0009)", () => {
    const usage = section("AI usage") ?? "";
    expect(usage).toContain("Gemma 4 12B-it (Q5_K_M)");
    expect(usage).toContain("temperature 0");
    expect(usage).toContain("no third-party AI provider");
  });

  it("lists the future improvements the ADRs name: a database, rolling-origin evaluation, follow-ups and Docker", () => {
    const future = (section("Future improvements") ?? "").toLowerCase();
    expect(["database", "rolling-origin", "follow-up", "docker"].filter((item) => !future.includes(item))).toEqual([]);
  });

  it.each(SECTIONS)("has a filled-in %s section", (heading) => {
    const text = section(heading);
    expect(text, `no "## ${heading}" section`).toBeDefined();
    expect(text).not.toBe("");
  });

  it("has no skeleton placeholder left: no paragraph or list item that is only an italic note", () => {
    const placeholders = readme.split("\n").filter((line) => /^(?:[-*]\s+)?_[^_].*_$/.test(line.trim()));
    expect(placeholders).toEqual([]);
  });

  it("names no Windows path, network share or the key file's folder: those belong in the operator's private runbook", () => {
    expect(readme.match(/\b[a-z]:[\\/][^\s`]*/gi) ?? []).toEqual([]);
    expect(readme.match(/\\\\[\w.-]+\\/g) ?? []).toEqual([]);
    expect(readme).not.toMatch(/ProgramData/i);
  });
});
