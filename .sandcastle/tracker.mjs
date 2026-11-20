#!/usr/bin/env node
// Local-markdown issue tracker for Sandcastle.
//
// Tickets are the files `/to-tickets` writes: .scratch/<feature>/issues/<NN>-<slug>.md
// with a `Status:` line and a `Blocked by:` line (plain or **bold** labels both work).
// Wayfinder decision tickets live in the same folders but never carry
// `ready-for-agent`, so they never reach Sandcastle.
//
// Commands:
//   node .sandcastle/tracker.mjs list               ready tickets as JSON (what Sandcastle reads)
//   node .sandcastle/tracker.mjs view <ID>          one ticket's markdown
//   node .sandcastle/tracker.mjs close <ID> [note]  mark done and append the note
//   node .sandcastle/tracker.mjs status             every ticket, for humans
//
// An ID is <feature>/<NN>, e.g. analytics-mvp/03.
// SANDCASTLE_TICKETS_DIR overrides the .scratch root (used by the tests).

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.env.SANDCASTLE_TICKETS_DIR || join(process.cwd(), ".scratch");
const READY = "ready-for-agent";
const DONE = new Set(["done", "resolved", "closed"]);

const field = (text, name) => {
  const re = new RegExp(`^\\s*(?:\\*\\*)?${name}:(?:\\*\\*)?\\s*(.*)$`, "im");
  const m = text.match(re);
  return m ? m[1].replace(/\*\*/g, "").trim() : null;
};

function load() {
  if (!existsSync(ROOT)) return [];
  const tickets = [];
  for (const feature of readdirSync(ROOT).sort()) {
    const dir = join(ROOT, feature, "issues");
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir).sort()) {
      const m = file.match(/^(\d{1,3})-.*\.md$/);
      if (!m) continue;
      const path = join(dir, file);
      const body = readFileSync(path, "utf8");
      const num = m[1].padStart(2, "0");
      const heading = body.match(/^#\s+(.+)$/m);
      const title = heading ? heading[1].replace(/^\d{1,3}\s*[:.-]\s*/, "").trim() : basename(file, ".md");
      const status = (field(body, "Status") || "").toLowerCase();
      tickets.push({ id: `${feature}/${num}`, feature, num, title, status, path, body, blockedBy: blockers(feature, field(body, "Blocked by")) });
    }
  }
  return tickets;
}

function blockers(feature, raw) {
  if (!raw || /^none\b/i.test(raw)) return [];
  const ids = new Set();
  for (const m of raw.matchAll(/(?:([a-z0-9][\w-]*)\/)?#?(\d{1,3})\b/gi)) {
    ids.add(`${m[1] || feature}/${m[2].padStart(2, "0")}`);
  }
  return [...ids];
}

function isReady(t, byId) {
  if (t.status !== READY) return false;
  return t.blockedBy.every((id) => byId.has(id) && DONE.has(byId.get(id).status));
}

function find(id) {
  const t = load().find((x) => x.id === id);
  if (!t) {
    console.error(`No ticket ${id}. IDs look like <feature>/<NN>; run "status" to see them.`);
    process.exit(2);
  }
  return t;
}

const [cmd, id, ...rest] = process.argv.slice(2);

if (cmd === "list") {
  const all = load();
  const byId = new Map(all.map((t) => [t.id, t]));
  const ready = all.filter((t) => isReady(t, byId)).map(({ id, title, body, blockedBy }) => ({ id, title, body, blockedBy }));
  console.log(JSON.stringify(ready, null, 2));
} else if (cmd === "view") {
  process.stdout.write(find(id).body);
} else if (cmd === "close") {
  const t = find(id);
  const note = rest.join(" ").trim() || "Completed by Sandcastle";
  const eol = t.body.includes("\r\n") ? "\r\n" : "\n";
  const statusRe = /^(\s*(?:\*\*)?Status:(?:\*\*)?\s*).*$/im;
  let body = statusRe.test(t.body)
    ? t.body.replace(statusRe, (_, label) => `${label}done`)
    : t.body.replace(/^(#\s+.+)$/m, `$1${eol}${eol}**Status:** done`);
  if (!/^## Comments\s*$/m.test(body)) body = body.replace(/\s*$/, `${eol}${eol}## Comments${eol}`);
  body = body.replace(/\s*$/, `${eol}${eol}- ${new Date().toISOString().slice(0, 10)}: ${note}${eol}`);
  writeFileSync(t.path, body);
  console.log(`Closed ${t.id}: ${t.title}`);
} else if (cmd === "status") {
  const all = load();
  const byId = new Map(all.map((t) => [t.id, t]));
  if (!all.length) console.log(`No tickets under ${ROOT} yet. Run /to-tickets first.`);
  for (const t of all) {
    const state = isReady(t, byId) ? "READY" : t.status === READY ? "blocked" : t.status || "-";
    const by = t.blockedBy.length ? `  (blocked by ${t.blockedBy.join(", ")})` : "";
    console.log(`${t.id.padEnd(28)} ${state.padEnd(16)} ${t.title}${by}`);
  }
} else {
  console.error("Usage: tracker.mjs list | view <ID> | close <ID> [note] | status");
  process.exit(1);
}
