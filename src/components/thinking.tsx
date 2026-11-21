"use client";

import { useEffect, useState } from "react";
import { AskedQuestion } from "./answer-parts";

/**
 * The answer card while the model works on a question (ticket 30): the question, three dots that pulse
 * in turn, "Thinking…", and a skeleton shaped like an answer. It claims no stage it cannot see: the
 * reply is not streamed, so it only counts the seconds.
 */

const SECONDS_FROM_MS = 3_000;
const BUSY_FROM_MS = 15_000;
const TICK_MS = 1_000;

export const BUSY_NOTE = "The model is busy; this can take up to a minute.";

/** "Thinking…", then from 3 s the whole seconds: "Thinking… 5 s". */
export function thinkingLabel(elapsedMs: number): string {
  return elapsedMs < SECONDS_FROM_MS ? "Thinking…" : `Thinking… ${Math.floor(elapsedMs / 1000)} s`;
}

/** Calls `onTick` with the time since `startedAt` every second, until the returned function stops it. */
export function elapsedTicker(startedAt: number, onTick: (elapsedMs: number) => void): () => void {
  const timer = setInterval(() => onTick(Date.now() - startedAt), TICK_MS);
  return () => clearInterval(timer);
}

/**
 * The card itself, for a given time since the question was sent. A follow-up or a re-run never reaches
 * the model, so it says "Computing…", with no seconds or busy note.
 */
export function ThinkingCard({ question, elapsedMs, model }: { question?: string; elapsedMs: number; model: boolean }) {
  return (
    <article aria-label="Working on the answer" className="card flex flex-col gap-3.5 p-5">
      <AskedQuestion question={question} />
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2.5 text-small font-semibold text-ink-2">
          <span aria-hidden="true" className="flex gap-1">
            {[0, 1, 2].map((dot) => (
              <span key={dot} data-dot className="size-1.5 animate-dot rounded-full bg-mark-on-time" style={{ animationDelay: `calc(var(--dur-1) * ${dot})` }} />
            ))}
          </span>
          {model ? thinkingLabel(elapsedMs) : "Computing…"}
        </p>
        {model && elapsedMs >= BUSY_FROM_MS ? <p className="text-small text-muted">{BUSY_NOTE}</p> : null}
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <span data-skeleton="sentence" className="shimmer block h-5 w-4/5" />
        <span className="shimmer block h-5 w-1/2" />
        <span data-skeleton="chart" className="shimmer mt-1 block h-40 max-w-[720px]" />
      </div>
    </article>
  );
}

/** The working card, its seconds counted from when the question was sent. */
export function Thinking({ question, startedAt, model }: { question?: string; startedAt: number; model: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => elapsedTicker(startedAt, setElapsedMs), [startedAt]);
  return <ThinkingCard question={question} elapsedMs={elapsedMs} model={model} />;
}
