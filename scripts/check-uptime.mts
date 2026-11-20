/**
 * node scripts/check-uptime.mts [base URL] — the daily uptime check (ADR 0010 §6), run by
 * .github/workflows/uptime.yml against https://wms.nalabs.ai. It checks that the dataset loaded
 * ("rows":400), that the AI answers (/api/health?ai=1), and that the dashboard page renders its
 * KPI cards, and exits 1 when any check fails. Everything it reads is public, so it needs no
 * secrets; Node 22.18 or later runs it as TypeScript with no npm install.
 */

interface CheckResult {
  ok: boolean;
  detail: string;
}

const base = (process.argv[2] ?? "https://wms.nalabs.ai").replace(/\/+$/, "");
const TIMEOUT_MS = 30_000;

async function get(path: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`${base}${path}`, {
    headers: { "user-agent": "spaceship-uptime-check" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, text: await response.text() };
}

function excerpt(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 200);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function datasetLoaded(): Promise<CheckResult> {
  const { status, text } = await get("/api/health");
  return { ok: status === 200 && text.includes('"rows":400'), detail: `HTTP ${status} ${excerpt(text)}` };
}

async function aiAnswers(): Promise<CheckResult> {
  const { status, text } = await get("/api/health?ai=1");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, detail: `HTTP ${status}, not JSON: ${excerpt(text)}` };
  }
  const ai = isRecord(body) && isRecord(body.ai) ? body.ai : undefined;
  if (status !== 200 || ai?.up !== true) {
    return { ok: false, detail: `HTTP ${status} ${typeof ai?.error === "string" ? ai.error : excerpt(text)}` };
  }
  const model = typeof ai.model === "string" ? ai.model : "not named";
  return { ok: true, detail: ai.busy === true ? `busy, but answering (model ${model})` : `model ${model}` };
}

async function dashboardRenders(): Promise<CheckResult> {
  const { status, text } = await get("/");
  return { ok: status === 200 && text.includes("Total orders"), detail: `HTTP ${status}` };
}

const CHECKS: [string, () => Promise<CheckResult>][] = [
  ["dataset loaded", datasetLoaded],
  ["AI answers", aiAnswers],
  ["dashboard page renders", dashboardRenders],
];

let failures = 0;
for (const [name, check] of CHECKS) {
  let result: CheckResult;
  try {
    result = await check();
  } catch (error) {
    result = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
  if (!result.ok) failures += 1;
  console.log(`${result.ok ? "ok  " : "FAIL"} ${name}: ${result.detail}`);
}
console.log(failures === 0 ? `All checks passed for ${base}.` : `${failures} check(s) failed for ${base}.`);
process.exit(failures === 0 ? 0 : 1);
