/**
 * npm run eval — sends every question in eval/questions.json through interpretation and reports how
 * many specs match (ADR 0009 §12), so a prompt change that breaks routing shows up at once. It needs
 * the gateway, so it runs on the server, never in CI or `npm run check`. Reads the same LLM_*
 * variables as the app (from .env.local when it exists). Exits 0 when every spec matches, 1 when
 * any misses, 2 when the eval could not run.
 */
import { readFileSync } from "node:fs";
import { AiError, createClient } from "../src/ai/client";
import { readLlmConfig } from "../src/ai/config";
import { evalFileSchema, formatEvalReport, runEval } from "../src/ai/eval";
import { modelAnswering } from "../src/ai/health";
import { interpret } from "../src/ai/interpret";

const QUESTIONS_FILE = "eval/questions.json";

/** Today on the server's calendar, YYYY-MM-DD: the date the README quotes. */
function localDate(now: Date): string {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
}

function readQuestions() {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(QUESTIONS_FILE, "utf8"));
  } catch (error) {
    return { ok: false as const, problem: `${QUESTIONS_FILE} could not be read: ${String(error)}` };
  }
  const parsed = evalFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, problem: `${QUESTIONS_FILE} is not valid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}` };
  }
  return { ok: true as const, questions: parsed.data.questions };
}

async function main(): Promise<number> {
  const config = readLlmConfig();
  if (!config.ok) {
    console.error(`Not configured: ${config.problem}.`);
    return 2;
  }
  const read = readQuestions();
  if (!read.ok) {
    console.error(read.problem);
    return 2;
  }
  const client = createClient(config.config);

  // The health check's 1-token call names the model the gateway actually answers with, and fails fast if it is down.
  let model: string;
  try {
    model = (await modelAnswering(client)) ?? config.config.model;
  } catch (error) {
    console.error(`The gateway did not answer: ${error instanceof AiError ? error.message : String(error)}`);
    return 2;
  }

  console.log(`Asking ${read.questions.length} questions through ${config.config.baseUrl}…`);
  const result = await runEval(
    read.questions,
    (question) => interpret(question, client, config.config.responseMode),
    (id, passed) => console.log(`${passed ? "ok  " : "MISS"} ${id}`),
  );
  console.log("");
  for (const line of formatEvalReport(result, { date: localDate(new Date()), model, configuredModel: config.config.model })) console.log(line);
  return result.misses.length === 0 ? 0 : 1;
}

void main().then((code) => {
  process.exitCode = code;
});
