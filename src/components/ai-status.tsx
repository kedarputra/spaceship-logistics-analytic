"use client";

import { useSyncExternalStore } from "react";
import { AI_STATUS_TEXT, type AiState, type AiStatus, aiStatusFrom } from "./ai-status-state";

/**
 * The AI status pill and the rail's status block (ADR 0011 §5). One poller per page serves every
 * place that shows the status: it asks /api/health?ai=1 when the first one appears, then once a
 * minute while any is shown. The server remembers its answer for a minute too (ADR 0009 §11).
 */

const POLL_MS = 60_000;
const CHECKING: AiStatus = { state: "checking" };

let current: AiStatus = CHECKING;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

async function check(): Promise<void> {
  let next: AiStatus;
  try {
    const response = await fetch("/api/health?ai=1", { cache: "no-store" });
    const body: unknown = await response.json().catch(() => undefined);
    next = aiStatusFrom(response.status, body);
  } catch {
    next = { state: "unavailable" };
  }
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    void check();
    timer = setInterval(() => void check(), POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function useAiStatus(): AiStatus {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => CHECKING,
  );
}

const PILL_STYLES: Record<AiState, { pill: string; dot: string }> = {
  checking: { pill: "border-line bg-panel text-muted", dot: "bg-grey-green" },
  online: { pill: "border-chip-line bg-ok-tint text-green-text", dot: "bg-mark-on-time" },
  busy: { pill: "border-warn-line bg-warn-tint text-warn-ink", dot: "bg-mark-delayed" },
  unavailable: { pill: "border-bad-line bg-bad-tint text-bad-ink", dot: "bg-mark-exception" },
};

/** The status in words, with a coloured dot beside it. */
export function AiStatusPill({ status }: { status: AiStatus }) {
  const style = PILL_STYLES[status.state];
  return (
    <span className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-small font-semibold ${style.pill}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${style.dot}`} />
      {AI_STATUS_TEXT[status.state]}
    </span>
  );
}

const RAIL_DOTS: Record<AiState, string> = {
  checking: "bg-rail-muted",
  online: "bg-rail-online",
  busy: "bg-amber",
  unavailable: "bg-bad-line",
};

/** The rail's status block: the state, the model by its display name (ticket 25), and what the AI does. */
export function RailAiStatus({ status, modelName }: { status: AiStatus; modelName: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-small font-medium text-panel">
        <span aria-hidden="true" className={`size-2 rounded-full ${RAIL_DOTS[status.state]}`} />
        {AI_STATUS_TEXT[status.state]}
      </span>
      <span className="text-note text-rail-muted">
        {`${modelName} on this server. The AI routes and explains; code computes every number.`}
      </span>
    </div>
  );
}

export function LiveAiStatusPill() {
  return <AiStatusPill status={useAiStatus()} />;
}

export function LiveRailAiStatus({ modelName }: { modelName: string }) {
  return <RailAiStatus status={useAiStatus()} modelName={modelName} />;
}
