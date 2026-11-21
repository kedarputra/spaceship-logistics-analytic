"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { formatCount } from "@/domain/format";
import type { Answer, FollowUp } from "@/tools/answer";
import { SKU_NOT_FORECAST } from "@/tools/forecast";
import type { ForecastAnswer } from "@/tools/forecast-answer";
import { TRACE_STAGES, type TraceStage } from "@/tools/trace-stage";
import type { AnswerOutcomeState } from "./answer-card";
import { AnswerRegion } from "./answer-region";
import { AskButton, QuestionField } from "./ask-box";
import { CardTitle } from "./card-title";
import { type HistoryEntry, useQuestionHistory } from "./history";
import { HistoryList } from "./history-list";
import { whileAsking } from "./question-activity";
import { SUGGESTED_QUESTIONS } from "./suggested-questions";

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

function isTraceStage(value: unknown): value is TraceStage {
  if (!isRecord(value)) return false;
  const { stage, detail, ms, flagged } = value;
  return (
    TRACE_STAGES.some((name) => name === stage) &&
    typeof detail === "string" &&
    (ms === undefined || typeof ms === "number") &&
    (flagged === undefined || flagged === true)
  );
}

/** The pipeline trace an answer came with, when the reply carries a readable one. */
function traceOf(body: Record<string, unknown>): TraceStage[] | undefined {
  const { trace } = body;
  return Array.isArray(trace) && trace.every(isTraceStage) ? trace : undefined;
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
  if (isAnswer(body)) return { kind: "answer", answer: body, cached, trace: traceOf(body) };
  if (isForecast(body)) return { kind: "forecast", forecast: body, cached, trace: traceOf(body) };
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
 * "Try these" (ticket 24): the suggested questions by group, each a button that asks it. Its info
 * popover says what the app won't answer, so a visitor need not find out by asking (ticket 30).
 */
function TryThese({ orderCount, onAsk }: { orderCount: number; onAsk: (question: string) => void }) {
  return (
    <section aria-labelledby="try-title" className="card flex flex-col gap-3 px-[18px] py-4">
      <CardTitle
        id="try-title"
        title="Try these"
        info={[
          `What it won't answer: questions outside these ${formatCount(orderCount)} orders, and combined forecast scopes such as crayons at one warehouse.`,
          SKU_NOT_FORECAST,
        ]}
      />
      {SUGGESTED_QUESTIONS.map(({ group, questions }) => (
        <div key={group} className="flex flex-col gap-1.5">
          <h3 className="text-label text-muted uppercase">{group}</h3>
          <ul className="flex flex-col gap-1.5">
            {questions.map((question) => (
              <li key={question}>
                <button type="button" onClick={() => onAsk(question)} className="chip chip-wide">
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export interface AskWorkspaceProps {
  /** The question in the page's `q`, asked once when the page opens. */
  initialQuestion?: string;
  orderCount: number;
}

/**
 * The Ask page's workspace (ticket 24): the form, the answer and how it was computed, and beside them
 * the suggested questions and the question history. Questions in words go through /api/ask, counted
 * as in flight for the rail's AI dot (ticket 30); follow-up chips and history re-runs send their spec
 * to /api/run, without the model. The history lives in this browser's localStorage only.
 */
export function AskWorkspace({ initialQuestion, orderCount }: AskWorkspaceProps) {
  const [draft, setDraft] = useState(initialQuestion ?? "");
  const [question, setQuestion] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<AnswerOutcomeState>({ kind: "idle" });
  const history = useQuestionHistory();
  const latest = useRef(0);
  const askedOnLoad = useRef(false);

  /** Shows the working card, then the reply; `model` says whether the reply waits on the model. */
  async function show(label: string, model: boolean, reply: () => Promise<AnswerOutcomeState>) {
    const request = ++latest.current;
    setQuestion(label);
    setOutcome({ kind: "loading", startedAt: Date.now(), model });
    const next = await reply();
    // A slower reply to an earlier question must not replace the answer to a later one.
    if (request === latest.current) setOutcome(next);
  }

  const ask = (text: string) => {
    setDraft(text);
    void show(text, true, async () => {
      const { outcome: answer } = await whileAsking(post("/api/ask", { question: text }));
      history.record(text, answer);
      return answer;
    });
  };
  const followUp = ({ label, spec }: FollowUp) => void show(label, false, async () => (await post("/api/run", { spec })).outcome);
  const rerun = (entry: HistoryEntry) =>
    void show(entry.question, false, async () => {
      const { outcome: answer, status } = await post("/api/run", { spec: entry.spec });
      // The whitelist refused the saved spec: the app changed since it was saved, so it would fail every time.
      if (status !== 400 || answer.kind !== "error") return answer;
      history.forget(entry.question);
      return { ...answer, message: SAVED_SPEC_REJECTED };
    });

  // The question in ?q= is asked once; the guard keeps a development double run from asking twice.
  useEffect(() => {
    if (askedOnLoad.current || initialQuestion === undefined) return;
    askedOnLoad.current = true;
    ask(initialQuestion);
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text !== "") ask(text);
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
        <form onSubmit={submit} className="card flex flex-wrap gap-2 p-4 shadow-raised">
          <QuestionField id="ask-question" value={draft} onChange={(event) => setDraft(event.target.value)} className="h-12 flex-[1_1_280px]" />
          <AskButton busy={outcome.kind === "loading"} disabled={draft.trim() === ""} />
        </form>
        <AnswerRegion question={question} outcome={outcome} onFollowUp={followUp} onAsk={ask} />
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
        <TryThese orderCount={orderCount} onAsk={ask} />
        <HistoryList entries={history.entries} onRerun={rerun} onClear={history.clearAll} />
      </div>
    </div>
  );
}
