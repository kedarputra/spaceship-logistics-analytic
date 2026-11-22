import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Ticket 36: this PC cannot run Docker, so CI's docker job is where the image is proven. These checks keep
// what can be read without Docker from drifting: the pinned base, the user, the files the server reads at
// run time, and what stays out of the build context.
const dockerfile = readFileSync("Dockerfile", "utf8");
const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
const ignored = readFileSync(".dockerignore", "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

describe("Dockerfile", () => {
  it("builds both stages on one exact release of Node 22, never a moving tag", () => {
    expect(dockerfile).toMatch(/^ARG NODE_IMAGE=node:22\.\d+\.\d+-bookworm-slim$/m);
    expect(dockerfile.match(/^FROM .*$/gm)).toEqual(["FROM ${NODE_IMAGE} AS build", "FROM ${NODE_IMAGE} AS runtime"]);
  });

  it("runs as the node user, with a health check on /api/health", () => {
    expect(runtime).toMatch(/^USER node$/m);
    expect(runtime).toMatch(/^HEALTHCHECK .*\\\n.*\/api\/health/m);
  });

  it("copies into the runtime stage what the server reads from disk: its config, the build, the dataset, and the report's fonts and mark", () => {
    const copies = ["COPY next.config.ts ./", "/app/.next ./.next", "COPY data ./data", "COPY assets/fonts ./assets/fonts", "COPY assets/wms-mark.png ./assets/wms-mark.png"];
    if (existsSync("public")) copies.push("COPY public ./public");
    expect(copies.filter((copy) => !runtime.includes(copy))).toEqual([]);
  });

  it("sets no secret, key or users file: those come from the environment when the container starts", () => {
    expect(dockerfile).not.toMatch(/\b(?:AUTH|LLM)_[A-Z_]+/);
  });
});

describe(".dockerignore", () => {
  it("keeps the history, the builds, every environment file, the brief, the private notes and the agents' files out of the image", () => {
    const required = [".git", "node_modules", ".next", "**/.env*", "docs/brief", "docs/private", ".scratch", ".sandcastle"];
    expect(required.filter((entry) => !ignored.includes(entry))).toEqual([]);
  });
});
