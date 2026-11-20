import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CARRIERS_QUESTION, FORECAST_QUESTION, OVERVIEW_QUESTIONS, SUGGESTED_QUESTIONS } from "./suggested-questions";

const evalQuestions = z
  .object({ questions: z.array(z.object({ question: z.string() })) })
  .parse(JSON.parse(readFileSync("eval/questions.json", "utf8")))
  .questions.map(({ question }) => question);

describe("the questions the pages suggest (ticket 24)", () => {
  it("groups the Ask page's suggestions as the design does", () => {
    expect(SUGGESTED_QUESTIONS.map(({ group }) => group)).toEqual(["Counts and shares", "Over time", "Rankings", "Forecasts"]);
    expect(SUGGESTED_QUESTIONS.flatMap(({ questions }) => questions)).toHaveLength(8);
  });

  it("are all in the eval set, so npm run eval checks each against the model", () => {
    const suggested = [...SUGGESTED_QUESTIONS.flatMap(({ questions }) => questions), ...OVERVIEW_QUESTIONS, CARRIERS_QUESTION, FORECAST_QUESTION];
    expect(suggested.filter((question) => !evalQuestions.includes(question))).toEqual([]);
  });
});
