"use client";

import { useState } from "react";
import { Spinner } from "./spinner";

/**
 * "Back to the original data" (ticket 35): drops this session's import, then loads the page again, so
 * the page, the rail and the banner are all drawn on the file once more.
 */
export function ClearImportButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function clear() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const response = await fetch("/api/import", { method: "DELETE" }).catch(() => undefined);
    if (response?.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setFailed(true);
  }

  return (
    <span className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="text-small text-bad-ink">
          Could not go back. Try again.
        </span>
      ) : null}
      <button type="button" onClick={() => void clear()} disabled={busy} className="button-small relative shrink-0 border-warn-line">
        <span className={busy ? "opacity-0" : undefined}>Back to the original data</span>
        {busy ? <Spinner /> : null}
      </button>
    </span>
  );
}
