// Sequential Reviewer, adapted for this repo.
//
// Per iteration, one ticket:
//   1. Implement: an agent picks the first READY ticket from the local markdown
//      tracker (.sandcastle/tracker.mjs reads .scratch/<feature>/issues/*.md),
//      builds it test-first on its own branch, closes the ticket, and commits.
//   2. Review: a second agent reviews that branch and fixes what it finds.
//   3. Merge: the host merges the branch back into the current branch, so the
//      next iteration sees the ticket as done and its dependants unblock.
//      (Tickets live in git, so without this merge every iteration would see
//      the same open ticket again.)
//
// Where it runs:
//   npm run sandcastle         Docker sandbox (local PC with Docker running)
//   npm run sandcastle:cloud   no-sandbox, for a Claude Code cloud session: the
//                              cloud container is already the sandbox. The agent
//                              runs with --permission-mode auto instead of
//                              --dangerously-skip-permissions.
//
// Settings (environment variables):
//   SANDCASTLE_SANDBOX          docker (default) | none
//   SANDCASTLE_MODEL            Claude model for both agents (default claude-opus-5-5)
//   SANDCASTLE_PERMISSION_MODE  only for none: auto (default) | acceptEdits | bypassPermissions
//   SANDCASTLE_MAX_ITERATIONS   tickets per run (default 10)

import { execFileSync } from "node:child_process";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

type PermissionMode = "auto" | "acceptEdits" | "bypassPermissions";

const MODE = process.env.SANDCASTLE_SANDBOX === "none" ? "none" : "docker";
const MODEL = process.env.SANDCASTLE_MODEL || "claude-opus-5-5";
const PERMISSION_MODE = (process.env.SANDCASTLE_PERMISSION_MODE || "auto") as PermissionMode;
const MAX_ITERATIONS = Number(process.env.SANDCASTLE_MAX_ITERATIONS || 10);

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();

// The merge step needs a clean checkout to merge into.
if (git("status", "--porcelain")) {
  console.error("Working tree has uncommitted changes. Commit or stash them, then run again.");
  process.exit(1);
}
const targetBranch = git("rev-parse", "--abbrev-ref", "HEAD");

const agent = () =>
  sandcastle.claudeCode(MODEL, MODE === "none" ? { permissionMode: PERMISSION_MODE } : {});

const sandboxProvider = () => (MODE === "none" ? noSandbox() : docker());

// Fresh dependencies in every sandbox; copying node_modules first makes it fast.
const hooks = { sandbox: { onSandboxReady: [{ command: "npm install" }] } };
const copyToWorktree = ["node_modules"];

console.log(`Sandcastle: sandbox=${MODE}, model=${MODEL}, target branch=${targetBranch}`);

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);
  const branch = `sandcastle/${Date.now()}`;

  const sandbox = await sandcastle.createSandbox({
    branch,
    sandbox: sandboxProvider(),
    hooks,
    copyToWorktree,
  });

  let committed = false;
  try {
    const implement = await sandbox.run({
      name: "implementer",
      maxIterations: 1,
      agent: agent(),
      promptFile: "./.sandcastle/implement-prompt.md",
    });

    if (!implement.commits.length) {
      console.log("Implementer made no commits: no READY ticket left, or all are blocked. Stopping.");
      break;
    }
    committed = true;
    console.log(`Implemented on ${branch} (${implement.commits.length} commit(s)). Reviewing...`);

    await sandbox.run({
      name: "reviewer",
      maxIterations: 1,
      agent: agent(),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: { BRANCH: branch },
    });
  } finally {
    await sandbox.close();
  }

  if (committed) {
    try {
      git("merge", "--no-ff", "-m", `Merge ${branch} (Sandcastle)`, branch);
      console.log(`Merged ${branch} into ${targetBranch}.`);
    } catch {
      try { git("merge", "--abort"); } catch { /* nothing to abort */ }
      console.error(`Merge of ${branch} into ${targetBranch} conflicted. The branch is kept; resolve it by hand, then run again.`);
      process.exit(1);
    }
  }
}

console.log("\nAll done. Ticket overview: npm run tickets");
