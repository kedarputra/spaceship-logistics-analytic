"use client";

import { type FormEvent, useRef, useState } from "react";
import type { Answer, FollowUp } from "@/tools/answer";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import { EXAMPLE_QUESTIONS, MAX_QUESTION_LENGTH } from "@/tools/examples";
import { AnswerOutcome, type AnswerOutcomeState } from "./answer-card";
import { type HistoryEntry, useQuestionHistory } from "./history";
import { HistoryList } from "./history-list";

/** The three questions of R3, asked in words like any other question. */
const EXAMPLES = [EXAMPLE_QUESTIONS.late_last_month, EXAMPLE_QUESTIONS.delayed_by_week, EXAMPLE_QUESTIONS.highest_delay_rate];


const UNREADABLE: AnswerOutcomeState = { kind: "error", message: "The server sent a reply this page cannot read.", details: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAnswer(body: unknown): body is Answer {
  return isRecord(body) && body.kind === "result" && Array.isArray(body.rows) && Array.isArray(body.followUps);
}

function isForecast(body: unknown): body is ForecastAnswer {
  return (
    isRecord(body) && body.kind === "forecast" && Array.isArray(body.forecastMonths) && Array.isArray(body.candidates) && Array.isArray(body.history)
  );
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function issueMessages(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => (isRecord(issue) && typeof issue.message === "string" ? [issue.message] : []));
}

/** What /api/run or /api/ask said, as one of the states the answer area shows. */
function toOutcome(body: unknown): AnswerOutcomeState {
  if (!isRecord(body)) return UNREADABLE;
  // /api/ask says whether its cache served the answer; /api/run never uses it.
  const cached = body.cached === true;
  if (isAnswer(body)) return { kind: "answer", answer: body, cached };
  if (isForecast(body)) return { kind: "forecast", forecast: body, cached };
  if (typeof body.error === "string") return { kind: "error", message: body.error, details: issueMessages(body.issues) };
  if (typeof body.message !== "string") return UNREADABLE;
  if (body.kind === "no-data") return { kind: "no-data", message: body.message };
  if (body.kind === "unsupported" && isStringList(body.examples)) return { kind: "unsupported", message: body.message, examples: body.examples };
  return UNREADABLE;
}

/** The reply as the answer area shows it, and the HTTP status when the server answered. */
async function post(path: "/api/run" | "/api/ask", payload: unknown): Promise<{ outcome: AnswerOutcomeState; status?: number }> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    return { outcome: { kind: "error", message: "The server could not be reached. Try again.", details: [] } };
  }
  try {
    return { outcome: toOutcome(await response.json()), status: response.status };
  } catch {
    return { outcome: UNREADABLE, status: response.status };
  }
}

const SAVED_SPEC_REJECTED = "This saved question no longer matches the app, so it was removed from the history. Ask it again.";

/**
 * The question box and example chips (through /api/ask), follow-up chips and the question history
 * (through /api/run, without the model). The history lives in this browser's localStorage only.
 */
export function AnswerView() {
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AnswerOutcomeState>({ kind: "idle" });
  const history = useQuestionHistory();
  const latest = useRef(0);

  async function show(label: string, reply: () => Promise<AnswerOutcomeState>) {
    const request = ++latest.current;
    setQuestion(label);
    setOutcome({ kind: "loading" });
    const next = await reply();
    // A slower reply to an earlier question must not replace the answer to a later one.
    if (request === latest.current) setOutcome(next);
  }

  const ask = (text: string) =>
    void show(text, async () => {
      const { outcome: answer } = await post("/api/ask", { question: text });
      history.record(text, answer);
      return answer;
    });
  const followUp = ({ label, spec }: FollowUp) => void show(label, async () => (await post("/api/run", { spec })).outcome);
  const rerun = (entry: HistoryEntry) =>
    void show(entry.question, async () => {
      const { outcome: answer, status } = await post("/api/run", { spec: entry.spec });
      // The whitelist refused the saved spec: the app changed since it was saved, so it would fail every time.
      if (status !== 400 || answer.kind !== "error") return answer;
      history.forget(entry.question);
      return { ...answer, message: SAVED_SPEC_REJECTED };
    });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text !== "") ask(text);
  }

  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="question" className="sr-only">
          Your question
        </label>
        <input
          id="question"
          value={draft}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about orders, deliveries, carriers or demand"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={draft.trim() === ""}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
        >
          Ask
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => ask(example)}
            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm text-blue-900 hover:bg-blue-100"
          >
            {example}
          </button>
        ))}
      </div>
      <HistoryList entries={history.entries} onRerun={rerun} onClear={history.clearAll} />
      {question === null ? null : <p className="mt-4 text-base font-medium">{question}</p>}
      <div className="mt-2" aria-live="polite">
        <AnswerOutcome outcome={outcome} onFollowUp={followUp} onAsk={ask} />
      </div>
    </div>
  );
}
