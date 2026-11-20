import { describe, expect, it } from "vitest";
import { answerQuery } from "@/tools/answer";
import { answerForecast } from "@/tools/forecast-answer";
import { forecastSpecSchema, querySpecSchema } from "@/tools/spec";
import type { AnswerOutcomeState } from "./answer-card";
import { browserStorage, clearHistory, forgetQuestion, HISTORY_KEY, type HistoryStorage, readHistory, recordAnswer } from "./history";

/** localStorage as a Map, with the stored text visible to the test. */
function memoryStorage(initial?: string) {
  const items = new Map<string, string>(initial === undefined ? [] : [[HISTORY_KEY, initial]]);
  const storage: HistoryStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
  return { storage, stored: () => items.get(HISTORY_KEY) };
}

/** A private window or blocked site data: every call throws. */
const blocked: HistoryStorage = {
  getItem: () => {
    throw new Error("SecurityError: access denied");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError: access denied");
  },
};

const LATE = { tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" }, assumption: "late" } as const;
const TOTAL_FORECAST = { tool: "forecast", scope: { type: "total" } } as const;

/** A real answer to a query spec, as the page holds it after /api/ask. */
function answered(spec: Record<string, unknown>): AnswerOutcomeState {
  const answer = answerQuery(querySpecSchema.parse(spec));
  if (answer.kind !== "result") throw new Error(answer.message);
  return { kind: "answer", answer };
}

function forecasted(spec: Record<string, unknown>): AnswerOutcomeState {
  const forecast = answerForecast(forecastSpecSchema.parse(spec));
  if (forecast.kind !== "forecast") throw new Error(forecast.message);
  return { kind: "forecast", forecast };
}

const ASKED_AT = new Date("2026-11-20T07:32:00.000Z");

describe("the question history (B1, ADR 0008 §1)", () => {
  it("keeps a question with its validated spec and the time it was asked, newest first", () => {
    const { storage } = memoryStorage();
    recordAnswer(storage, "How many orders were delivered late last month?", answered(LATE), ASKED_AT);
    const history = recordAnswer(storage, "How much inventory should I plan?", forecasted(TOTAL_FORECAST), new Date("2026-11-20T07:40:00.000Z"));
    expect(history).toEqual([
      { question: "How much inventory should I plan?", spec: TOTAL_FORECAST, askedAt: "2026-11-20T07:40:00.000Z" },
      { question: "How many orders were delivered late last month?", spec: LATE, askedAt: "2026-11-20T07:32:00.000Z" },
    ]);
    expect(readHistory(storage)).toEqual(history);
  });

  it("keeps the last 20, dropping the oldest", () => {
    const { storage } = memoryStorage();
    for (let index = 1; index <= 22; index++) recordAnswer(storage, `Question ${index}`, answered(LATE), ASKED_AT);
    const history = readHistory(storage);
    expect(history).toHaveLength(20);
    expect(history[0]?.question).toBe("Question 22");
    expect(history.at(-1)?.question).toBe("Question 3");
  });

  it("moves a question asked again to the top instead of keeping a copy", () => {
    const { storage } = memoryStorage();
    recordAnswer(storage, "How many orders were delivered late last month?", answered(LATE), ASKED_AT);
    recordAnswer(storage, "How much inventory should I plan?", forecasted(TOTAL_FORECAST), ASKED_AT);
    const history = recordAnswer(storage, "  how many orders were delivered LATE last month? ", answered(LATE), ASKED_AT);
    expect(history.map((entry) => entry.question)).toEqual(["how many orders were delivered LATE last month?", "How much inventory should I plan?"]);
  });

  it("does not keep a question that has no spec to re-run: unsupported, no data, or an error", () => {
    const { storage, stored } = memoryStorage();
    for (const outcome of [
      { kind: "unsupported", message: "Not about the data.", examples: [] },
      { kind: "no-data", message: "No SKU CRAYON-9999 in the data." },
      { kind: "error", message: "AI unavailable right now.", details: [] },
    ] satisfies AnswerOutcomeState[]) {
      expect(recordAnswer(storage, "Something", outcome, ASKED_AT)).toEqual([]);
    }
    expect(stored()).toBeUndefined();
  });

  it("drops what it cannot read: text that is not JSON, and entries that are not a question with a runnable spec", () => {
    expect(readHistory(memoryStorage("not json").storage)).toEqual([]);
    expect(readHistory(memoryStorage('{"question":"x"}').storage)).toEqual([]);
    const mixed = JSON.stringify([
      { question: "Kept", spec: LATE, askedAt: "2026-11-20T07:32:00.000Z" },
      { question: "SQL", spec: { tool: "sql", query: "SELECT 1" }, askedAt: "2026-11-20T07:32:00.000Z" },
      { question: "No time", spec: LATE },
      { question: "", spec: LATE, askedAt: "2026-11-20T07:32:00.000Z" },
      { question: "Bad time", spec: LATE, askedAt: "yesterday" },
    ]);
    expect(readHistory(memoryStorage(mixed).storage).map((entry) => entry.question)).toEqual(["Kept"]);
  });

  it("shows no history, and never throws, when storage is blocked or missing", () => {
    expect(readHistory(blocked)).toEqual([]);
    expect(recordAnswer(blocked, "How many orders were delivered late last month?", answered(LATE), ASKED_AT)).toEqual([]);
    expect(() => clearHistory(blocked)).not.toThrow();
    expect(readHistory(undefined)).toEqual([]);
    expect(recordAnswer(undefined, "Question", answered(LATE), ASKED_AT)).toEqual([]);
    // Outside a browser there is no localStorage at all.
    expect(browserStorage()).toBeUndefined();
  });

  it("forgets one question, such as a saved spec the app no longer accepts", () => {
    const { storage } = memoryStorage();
    recordAnswer(storage, "Question one", answered(LATE), ASKED_AT);
    recordAnswer(storage, "Question two", answered(LATE), ASKED_AT);
    expect(forgetQuestion(storage, "question ONE").map((entry) => entry.question)).toEqual(["Question two"]);
    expect(readHistory(storage).map((entry) => entry.question)).toEqual(["Question two"]);
    expect(forgetQuestion(blocked, "Question two")).toEqual([]);
  });

  it("clears the history", () => {
    const { storage, stored } = memoryStorage();
    recordAnswer(storage, "Question", answered(LATE), ASKED_AT);
    clearHistory(storage);
    expect(stored()).toBeUndefined();
    expect(readHistory(storage)).toEqual([]);
  });
});
