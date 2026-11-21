"use client";

import { useEffect, useState } from "react";
import type { FollowUp } from "@/tools/answer";
import { AnswerOutcome, type AnswerOutcomeState } from "./answer-card";
import { motionMs } from "./motion";
import { Thinking } from "./thinking";

/** "82.2% of delivered orders arrived on time." from a longer text: up to its first full stop. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  return /^.*?[.!?](?=\s|$)/s.exec(trimmed)?.[0] ?? trimmed;
}

/**
 * What the polite live region says (ticket 30): "Thinking" once while the model works ("Computing" for a
 * follow-up, which only runs code), then the reply's first sentence. An error is an alert of its own,
 * and before the first question there is nothing to say.
 */
export function announcement(outcome: AnswerOutcomeState): string {
  switch (outcome.kind) {
    case "loading":
      return outcome.model ? "Thinking" : "Computing";
    case "answer":
      return firstSentence(outcome.answer.sentence);
    case "forecast":
      return firstSentence(outcome.forecast.sentence);
    case "no-data":
    case "unsupported":
      return firstSentence(outcome.message);
    case "idle":
    case "error":
      return "";
  }
}

interface AnswerRegionProps {
  question?: string;
  outcome: AnswerOutcomeState;
  onFollowUp: (followUp: FollowUp) => void;
  onAsk: (question: string) => void;
}

/**
 * The Ask page's answer region (ticket 30): busy while the model works, its working card cross-fading
 * into the reply in the same place, so the card keeps its width. The working card and the reply share
 * one grid cell for the length of the fade; each new reply arrives with the motion system's fade.
 */
export function AnswerRegion({ question, outcome, onFollowUp, onAsk }: AnswerRegionProps) {
  // The outcome last seen, and how many it has been: each new reply arrives afresh.
  const [previous, setPrevious] = useState(outcome);
  const [replies, setReplies] = useState(0);
  const [working, setWorking] = useState(outcome.kind === "loading" ? { ...outcome, leaving: false } : undefined);
  if (previous !== outcome) {
    setPrevious(outcome);
    setReplies(replies + 1);
    if (outcome.kind === "loading") setWorking({ ...outcome, leaving: false });
    else if (working !== undefined) setWorking({ ...working, leaving: true });
  }

  // The working card leaves once it has faded out.
  useEffect(() => {
    if (working?.leaving !== true) return;
    const timer = setTimeout(() => setWorking(undefined), motionMs("--dur-2"));
    return () => clearTimeout(timer);
  }, [working]);

  const replied = outcome.kind !== "loading" && outcome.kind !== "idle";
  return (
    <div aria-busy={outcome.kind === "loading"} className="grid grid-cols-[minmax(0,1fr)] items-start">
      <p aria-live="polite" className="sr-only">
        {announcement(outcome)}
      </p>
      {working === undefined ? null : (
        <div
          key={`working-${working.startedAt}`}
          inert={working.leaving}
          className={`col-start-1 row-start-1 ${working.leaving ? "pointer-events-none animate-leave" : "animate-arrive"}`}
        >
          <Thinking question={question} startedAt={working.startedAt} model={working.model} />
        </div>
      )}
      {replied ? (
        <div key={`reply-${replies}`} className="col-start-1 row-start-1 flex min-w-0 animate-arrive flex-col gap-4">
          <AnswerOutcome question={question} outcome={outcome} onFollowUp={onFollowUp} onAsk={onAsk} />
        </div>
      ) : null}
    </div>
  );
}
