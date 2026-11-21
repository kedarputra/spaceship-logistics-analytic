"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a question is with the model right now (ticket 30), so the rail's AI dot can pulse while one
 * is in flight. The Ask page counts its questions in and out; anything on the page can watch.
 */

let inFlight = 0;
const listeners = new Set<() => void>();

function countInFlight(by: number) {
  inFlight += by;
  for (const listener of listeners) listener();
}

/** Counts `reply` as in flight until it settles, and passes it on. */
export async function whileAsking<T>(reply: Promise<T>): Promise<T> {
  countInFlight(1);
  try {
    return await reply;
  } finally {
    countInFlight(-1);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQuestionInFlight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => inFlight > 0,
    () => false,
  );
}
