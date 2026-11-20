"use client";

import { useRef, useState } from "react";
import type { Answer, FollowUp } from "@/tools/answer";
import type { QuerySpec } from "@/tools/spec";
import { AnswerOutcome, type AnswerOutcomeState } from "./answer-card";

/** A question shown as a chip, with the spec that answers it. */
type ExampleQuestion = FollowUp;

/** The three questions of R3, each run as a prebuilt spec. */
const EXAMPLES: ExampleQuestion[] = [
  {
    label: "How many orders were delivered late last month?",
    spec: { tool: "query", metric: "delayed_orders", period: { type: "previous", unit: "month" } },
  },
  {
    label: "Show delayed orders by week for the last 3 months",
    spec: { tool: "query", metric: "delayed_orders", groupBy: "week", period: { type: "last", count: 3, unit: "month" } },
  },
  {
    label: "Which carrier has the highest delay rate?",
    spec: { tool: "query", metric: "delay_rate", groupBy: "carrier", sort: "desc" },
  },
];

const UNREADABLE: AnswerOutcomeState = { kind: "error", message: "The server sent a reply this page cannot read.", details: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAnswer(body: unknown): body is Answer {
  return isRecord(body) && body.kind === "result" && Array.isArray(body.rows) && Array.isArray(body.followUps);
}

function issueMessages(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => (isRecord(issue) && typeof issue.message === "string" ? [issue.message] : []));
}

/** What /api/run said, as one of the states the answer area shows. */
function toOutcome(body: unknown): AnswerOutcomeState {
  if (isAnswer(body)) return { kind: "answer", answer: body };
  if (isRecord(body) && body.kind === "no-data" && typeof body.message === "string") return { kind: "no-data", message: body.message };
  if (isRecord(body) && typeof body.error === "string") return { kind: "error", message: body.error, details: issueMessages(body.issues) };
  return UNREADABLE;
}

async function runSpec(spec: QuerySpec): Promise<AnswerOutcomeState> {
  let response: Response;
  try {
    response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec }),
    });
  } catch {
    return { kind: "error", message: "The server could not be reached. Try again.", details: [] };
  }
  try {
    return toOutcome(await response.json());
  } catch {
    return UNREADABLE;
  }
}

/** Example questions and follow-up chips, each run through /api/run; no LLM is involved. */
export function AnswerView() {
  const [question, setQuestion] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AnswerOutcomeState>({ kind: "idle" });
  const latest = useRef(0);

  async function ask({ label, spec }: FollowUp) {
    const request = ++latest.current;
    setQuestion(label);
    setOutcome({ kind: "loading" });
    const next = await runSpec(spec);
    // A slower reply to an earlier click must not replace the answer to a later one.
    if (request === latest.current) setOutcome(next);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => void ask(example)}
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-900 hover:bg-blue-100"
          >
            {example.label}
          </button>
        ))}
      </div>
      {question === null ? null : <p className="mt-4 text-base font-medium">{question}</p>}
      <div className="mt-2" aria-live="polite">
        <AnswerOutcome outcome={outcome} onFollowUp={(followUp) => void ask(followUp)} />
      </div>
    </div>
  );
}
