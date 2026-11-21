"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { formatDate } from "@/domain/periods";
import { countOf } from "@/tools/words";
import { CardTitle } from "./card-title";
import { Icon } from "./icons";
import { type ImportCheck, moreProblems, problemRow } from "./import-result";
import { KpiCards } from "./kpi-cards";
import { Spinner } from "./spinner";
import { Table } from "./text-table";

/**
 * Import's workspace (ticket 35): a drop zone and a file picker, the template, and the check of the file
 * chosen: its rows and problems, and for a clean file the five KPIs it would show. "Use this data" sends
 * the same file again; the server checks it again and keeps it all or not at all, then the whole app
 * loads on it.
 */

type State =
  | { kind: "idle" }
  | { kind: "checking"; file: File }
  | { kind: "checked"; file: File; check: ImportCheck }
  | { kind: "using"; file: File; check: ImportCheck }
  | { kind: "failed"; message: string; count: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCheck(value: unknown): value is ImportCheck {
  return isRecord(value) && typeof value.fileName === "string" && typeof value.rows === "number" && Array.isArray(value.problems);
}

/**
 * The type the file is sent as. Windows names .csv files after Excel (application/vnd.ms-excel) when
 * Excel is installed, and some browsers give no type at all: a .csv is sent as text/csv then. The server
 * reads it as UTF-8 CSV whatever it is called.
 */
function uploadType(file: File): string {
  return file.type === "" || file.type === "application/vnd.ms-excel" ? "text/csv" : file.type;
}

const NOT_CHECKED = "The file could not be checked. Try again.";

async function upload(file: File, use: boolean): Promise<{ check: ImportCheck } | { used: true } | { error: string }> {
  let response: Response;
  try {
    response = await fetch(use ? "/api/import?use=1" : "/api/import", {
      method: "POST",
      headers: { "content-type": uploadType(file), "x-file-name": encodeURIComponent(file.name) },
      body: file,
    });
  } catch {
    return { error: "The server could not be reached. Try again." };
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok && isRecord(body) && body.used === true) return { used: true };
  if (response.ok && isCheck(body)) return { check: body };
  if (response.status === 422 && isCheck(body)) return { check: body };
  return { error: isRecord(body) && typeof body.error === "string" ? body.error : NOT_CHECKED };
}

function Problems({ check }: { check: ImportCheck }) {
  const more = moreProblems(check);
  return (
    <div className="flex flex-col gap-2">
      {/* On a narrow screen the table scrolls inside its card rather than squeezing the problem to a few letters a line. */}
      <Table
        headers={["Row", "Column", "Problem"]}
        rows={check.problems.map((problem) => [
          problemRow(problem),
          <span key="column" className="whitespace-nowrap">
            {problem.column ?? ""}
          </span>,
          <span key="problem" className="block min-w-52">
            {problem.message}
          </span>,
        ])}
      />
      {more === undefined ? null : <p className="text-small text-muted">{more}</p>}
    </div>
  );
}

/** A checked file: its rows and problems, or for a clean one the KPIs it would show; "Use this data" only with no problem. */
export function CheckResult({ check, using, onUse }: { check: ImportCheck; using: boolean; onUse: () => void }) {
  const clean = check.problemCount === 0 && check.preview !== undefined;
  return (
    <section aria-labelledby="result-title" className="card card-body animate-arrive">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle id="result-title" title={check.fileName} detail={`${countOf(check.rows, "row")} · ${countOf(check.problemCount, "problem")}`} />
        <button type="button" onClick={onUse} disabled={!clean || using} className="button-primary relative">
          <span className={using ? "opacity-0" : undefined}>Use this data</span>
          {using ? <Spinner /> : null}
        </button>
      </div>
      {check.preview === undefined ? (
        <Problems check={check} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-small text-ink-2">
            <Icon name="calendar" size={15} className="text-grey-green" />
            {`Data as of ${formatDate(check.preview.anchor)}`}
          </p>
          <KpiCards kpis={check.preview.kpis} linked={false} />
        </div>
      )}
    </section>
  );
}

/** `rules` are the import rules in words, for the file card's info popover. */
export function ImportWorkspace({ rules }: { rules: readonly string[] }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = state.kind === "checking" || state.kind === "using";

  async function check(file: File) {
    if (busy) return;
    setState({ kind: "checking", file });
    const outcome = await upload(file, false);
    if ("check" in outcome) {
      setState({ kind: "checked", file, check: outcome.check });
      return;
    }
    // A check is never answered "used"; anything but a check is a refusal.
    setFailure("error" in outcome ? outcome.error : NOT_CHECKED);
  }

  /** Each refusal is a new alert, so the same words said twice are announced twice. */
  function setFailure(message: string) {
    setState((previous) => ({ kind: "failed", message, count: previous.kind === "failed" ? previous.count + 1 : 0 }));
  }

  async function use() {
    if (state.kind !== "checked") return;
    const { file } = state;
    setState({ kind: "using", file, check: state.check });
    const outcome = await upload(file, true);
    if ("used" in outcome) {
      // Every page, the rail and the banner are drawn again on the imported data.
      window.location.assign("/");
      return;
    }
    if ("check" in outcome) setState({ kind: "checked", file, check: outcome.check });
    else setFailure(outcome.error);
  }

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file !== undefined) void check(file);
  }

  function dropped(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) void check(file);
  }

  return (
    <>
      <section aria-labelledby="file-title" className="card card-body">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle id="file-title" title="Orders file" info={rules} />
          <a href="/api/import/template" download className="button-small gap-1.5 no-underline">
            <Icon name="download" size={15} />
            Download a template
          </a>
        </div>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={dropped}
          className={`flex flex-col items-center justify-center gap-3 rounded-inset border-2 border-dashed px-4 py-10 text-center ${dragging ? "border-grey-green bg-chip" : "border-field bg-inset"}`}
        >
          <span className="grid size-10 place-items-center rounded-control bg-chip text-grey-green">
            <Icon name="table" size={20} />
          </span>
          <p className="text-ink-2">Drop a CSV file here</p>
          <input ref={input} id="import-file" type="file" accept=".csv,text/csv,text/plain" onChange={picked} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="button-small relative gap-1.5">
            <span className={state.kind === "checking" ? "opacity-0" : "inline-flex items-center gap-1.5"}>
              <Icon name="search" size={15} />
              Choose a file
            </span>
            {state.kind === "checking" ? <Spinner /> : null}
          </button>
          <p aria-live="polite" className="text-small text-muted">
            {state.kind === "checking" ? `Checking ${state.file.name}…` : ""}
          </p>
        </div>
        {state.kind === "failed" ? (
          <p key={state.count} role="alert" className="animate-arrive rounded-control border border-bad-line bg-bad-tint px-3.5 py-2.5 text-small text-bad-ink">
            {state.message}
          </p>
        ) : null}
      </section>
      {state.kind === "checked" || state.kind === "using" ? <CheckResult check={state.check} using={state.kind === "using"} onUse={() => void use()} /> : null}
    </>
  );
}
