import { z } from "zod";
import { normalizeInterpretation, sameInterpretation } from "@/tools/eval-spec";
import { MAX_QUESTION_LENGTH } from "@/tools/examples";
import { interpretationSchema } from "@/tools/spec";
import { AiError } from "./client";
import type { InterpretOutcome } from "./interpret";

/**
 * The eval (ADR 0009 §12): the committed question list sent through interpretation, each spec
 * compared with the expected one after normalization, and a report of the pass rate and every miss.
 * `npm run eval` runs it against the gateway, on the server; tests run it with a fake interpreter.
 */

/** eval/questions.json: every expected spec must be one the whitelist accepts. */
export const evalFileSchema = z.object({
  about: z.string().optional(),
  questions: z.array(z.object({ id: z.string(), question: z.string().max(MAX_QUESTION_LENGTH), expected: interpretationSchema })),
});

export type EvalQuestion = z.output<typeof evalFileSchema>["questions"][number];

export interface EvalMiss {
  id: string;
  question: string;
  /** Both specs normalized, as the comparison saw them. */
  expected: Record<string, unknown>;
  actual?: Record<string, unknown>;
  /** Why there is no spec: the call failed, or the reply held no valid spec. */
  error?: string;
}

export interface EvalResult {
  total: number;
  passed: number;
  misses: EvalMiss[];
}

/** A gateway error as the app words it; anything else, such as a bug, as itself rather than as an outage. */
function errorMessage(error: unknown): string {
  return error instanceof AiError ? error.message : String(error);
}

/** Asks each question in turn (the gateway has few slots) and compares the spec it gets back. */
export async function runEval(
  questions: readonly EvalQuestion[],
  interpret: (question: string) => Promise<InterpretOutcome>,
  onResult: (id: string, passed: boolean) => void = () => undefined,
): Promise<EvalResult> {
  const misses: EvalMiss[] = [];
  for (const { id, question, expected } of questions) {
    const base = { id, question, expected: normalizeInterpretation(expected) };
    let outcome: InterpretOutcome;
    try {
      outcome = await interpret(question);
    } catch (error) {
      misses.push({ ...base, error: errorMessage(error) });
      onResult(id, false);
      continue;
    }
    if (outcome.kind === "failed") {
      misses.push({ ...base, error: `No valid spec, even after the retry: ${outcome.problems.join("; ")}` });
      onResult(id, false);
      continue;
    }
    const passed = sameInterpretation(expected, outcome.interpretation);
    if (!passed) misses.push({ ...base, actual: normalizeInterpretation(outcome.interpretation) });
    onResult(id, passed);
  }
  return { total: questions.length, passed: questions.length - misses.length, misses };
}

/** The report: one line for the README (pass rate, date, model), then each miss with both specs. */
export function formatEvalReport(result: EvalResult, run: { date: string; model: string; configuredModel: string }): string[] {
  const model = run.model === run.configuredModel ? run.model : `${run.model} (configured as "${run.configuredModel}")`;
  const count = result.total === 1 ? "1 question" : `${result.total} questions`;
  const rate = result.total === 0 ? 0 : Math.round((result.passed / result.total) * 100);
  const lines = [`Eval, ${run.date}, model ${model}: ${count}.`, `${result.passed} of ${result.total} specs match (${rate}%).`];
  if (result.misses.length === 0) return [...lines, "No misses."];
  lines.push("Misses:");
  for (const miss of result.misses) {
    lines.push(`- ${miss.id}: ${miss.question}`, `    expected ${JSON.stringify(miss.expected)}`);
    lines.push(miss.actual === undefined ? `    error    ${miss.error ?? ""}` : `    actual   ${JSON.stringify(miss.actual)}`);
  }
  return lines;
}
