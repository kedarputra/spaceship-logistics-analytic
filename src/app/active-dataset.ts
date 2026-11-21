import { type ActiveDataset, getDataset } from "@/domain/orders";
import { importStore } from "./import-store";

/**
 * The one way to the data a request runs on (ticket 35): the session's import while it lasts, else the
 * file in data/. Pages get it from `withRole`, API routes from `withApiRole` and the layout from
 * `currentViewer`, each with the session ID from the verified cookie; nothing else picks a dataset. A
 * session without an ID (signed before ticket 35) has no import.
 */
export function getActiveDataset(sessionId: string | undefined): ActiveDataset {
  const imported = sessionId === undefined ? undefined : importStore().get(sessionId);
  return imported ?? getDataset();
}
