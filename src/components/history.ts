import { useEffect, useState } from "react";
import { MAX_QUESTION_LENGTH } from "@/tools/examples";
import type { AnswerOutcomeState } from "./answer-card";

/**
 * The question history (B1, ADR 0008 §1): the last 20 questions in this browser's localStorage, each
 * with its validated spec and the time it was asked, so it can be re-run through /api/run without
 * the model. Nothing about it is sent to the server. Every read and write is wrapped, so a private
 * window or blocked storage means no history, never a broken page.
 */

/**
 * Versioned: when the spec schema changes in a way old entries would fail, bump it and old entries
 * are left unread. An entry the server still rejects is forgotten when its re-run is refused.
 */
export const HISTORY_KEY = "spaceship.history.v1";
const MAX_HISTORY = 20;

/** A spec as stored, checked only loosely here: /api/run validates it again before running it. */
export type RunnableSpec = { tool: "query" | "forecast"; [field: string]: unknown };

export interface HistoryEntry {
  question: string;
  spec: RunnableSpec;
  /** ISO timestamp. */
  askedAt: string;
}

export type HistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage, or undefined where there is none or touching it throws. */
export function browserStorage(): HistoryStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunnableSpec(value: unknown): value is RunnableSpec {
  return isRecord(value) && (value.tool === "query" || value.tool === "forecast");
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!isRecord(value)) return false;
  const { question, spec, askedAt } = value;
  return (
    typeof question === "string" &&
    question.trim() !== "" &&
    question.length <= MAX_QUESTION_LENGTH &&
    isRunnableSpec(spec) &&
    typeof askedAt === "string" &&
    !Number.isNaN(Date.parse(askedAt))
  );
}

/** The spec to re-run an answer with: a query's spec as asked (before any rewrite), or a forecast's. */
function specOf(outcome: AnswerOutcomeState): RunnableSpec | undefined {
  if (outcome.kind === "answer") return outcome.answer.requestedSpec;
  if (outcome.kind === "forecast") return outcome.forecast.spec;
  return undefined;
}

function sameQuestion(a: string, b: string): boolean {
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(a) === normalize(b);
}

/** The stored history, newest first; empty when there is none, it cannot be read, or storage is blocked. */
export function readHistory(storage: HistoryStorage | undefined): HistoryEntry[] {
  if (storage === undefined) return [];
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function writeHistory(storage: HistoryStorage | undefined, entries: readonly HistoryEntry[]): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/**
 * Adds an answered question to the top of the history, replacing an earlier copy of it, and returns
 * the history to show: unchanged for an outcome with no spec to re-run, empty when storage is blocked.
 */
export function recordAnswer(storage: HistoryStorage | undefined, question: string, outcome: AnswerOutcomeState, now: Date): HistoryEntry[] {
  const current = readHistory(storage);
  const spec = specOf(outcome);
  if (spec === undefined) return current;
  const trimmed = question.trim();
  const entry: HistoryEntry = { question: trimmed, spec, askedAt: now.toISOString() };
  const next = [entry, ...current.filter((earlier) => !sameQuestion(earlier.question, trimmed))].slice(0, MAX_HISTORY);
  return writeHistory(storage, next) ? next : [];
}

/** Removes one question, such as a saved spec the server no longer accepts, and returns the history to show. */
export function forgetQuestion(storage: HistoryStorage | undefined, question: string): HistoryEntry[] {
  const next = readHistory(storage).filter((entry) => !sameQuestion(entry.question, question));
  return writeHistory(storage, next) ? next : [];
}

export function clearHistory(storage: HistoryStorage | undefined): void {
  try {
    storage?.removeItem(HISTORY_KEY);
  } catch {
    // Blocked storage holds no history to clear.
  }
}

/**
 * The history for the page: read from this browser after the first render (the server has no
 * localStorage, and both renders must match), and kept in step with every change it makes.
 */
export function useQuestionHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  useEffect(() => setEntries(readHistory(browserStorage())), []);
  return {
    entries,
    record: (question: string, outcome: AnswerOutcomeState) => setEntries(recordAnswer(browserStorage(), question, outcome, new Date())),
    forget: (question: string) => setEntries(forgetQuestion(browserStorage(), question)),
    clearAll: () => {
      clearHistory(browserStorage());
      setEntries([]);
    },
  };
}
