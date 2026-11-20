import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_QUESTION_LENGTH } from "@/tools/examples";
import { interpretationSchema } from "@/tools/spec";

// The committed eval list (ADR 0009 §12): every expected spec must be one the whitelist accepts,
// or the eval would score the model against an answer the app itself would refuse.
const evalFile = z.object({
  questions: z.array(z.object({ id: z.string(), question: z.string().max(MAX_QUESTION_LENGTH), expected: z.unknown() })),
});
const { questions } = evalFile.parse(JSON.parse(readFileSync("eval/questions.json", "utf8")));

describe("eval/questions.json", () => {
  it("has about 20 questions with unique ids", () => {
    expect(questions.length).toBeGreaterThanOrEqual(20);
    expect(new Set(questions.map((entry) => entry.id)).size).toBe(questions.length);
  });

  it("asks the R3 and R9 questions as the brief words them", () => {
    const asked = questions.map((entry) => entry.question);
    expect(asked).toEqual(
      expect.arrayContaining([
        "How many orders were delivered late last month?",
        "Show delayed orders by week for the last 3 months",
        "Which carrier has the highest delay rate?",
        "How much inventory should I plan?",
      ]),
    );
  });

  it.each(questions)("expects a valid spec for $id", ({ expected }) => {
    const result = interpretationSchema.safeParse(expected);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([]);
  });

  it("never copies a worked example from the prompt, so the score is not the model recalling it", () => {
    const prompt = readFileSync("src/ai/prompts.ts", "utf8");
    expect(questions.filter((entry) => prompt.includes(entry.question)).map((entry) => entry.id)).toEqual([]);
  });

  it("covers queries, forecasts, and unsupported questions", () => {
    const tools = new Set(questions.map(({ expected }) => interpretationSchema.parse(expected).tool));
    expect([...tools].sort()).toEqual(["forecast", "query", "unsupported"]);
  });
});
