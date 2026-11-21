import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataset } from "@/domain/orders";
import { type Answer, presentAnswer } from "@/tools/answer";
import { runQuery } from "@/tools/query";
import { querySpecSchema } from "@/tools/spec";
import type { AnswerOutcomeState } from "./answer-card";
import { AnswerRegion, announcement } from "./answer-region";
import { AskButton } from "./ask-box";
import { visibleText } from "./markup-text";
import { elapsedTicker, ThinkingCard, thinkingLabel } from "./thinking";

const QUESTION = "Which carrier is the least reliable?";

function answerFor(spec: Record<string, unknown>): Answer {
  const result = runQuery(querySpecSchema.parse({ tool: "query", ...spec }), getDataset());
  if (result.kind !== "result") throw new Error(result.message);
  return presentAnswer(result, getDataset().orders);
}

function region(outcome: AnswerOutcomeState): string {
  return renderToStaticMarkup(<AnswerRegion question={QUESTION} outcome={outcome} onFollowUp={() => undefined} onAsk={() => undefined} />);
}

/** The polite live region's words. */
function spoken(html: string): string {
  return visibleText(/<p[^>]*aria-live="polite"[^>]*>(.*?)<\/p>/s.exec(html)?.[1] ?? "").trim();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the answer card while the model works (ticket 30)", () => {
  it("shows the question, three dots, Thinking… and a skeleton shaped like an answer: a sentence and a chart", () => {
    const html = renderToStaticMarkup(<ThinkingCard question={QUESTION} elapsedMs={0} model />);
    expect(visibleText(html).trim()).toBe(`${QUESTION} Thinking…`);
    expect([...html.matchAll(/data-dot/g)]).toHaveLength(3);
    expect(html).toContain('data-skeleton="sentence"');
    expect(html).toContain('data-skeleton="chart"');
  });

  it("adds the seconds after 3 s, and after 15 s that the model is busy", () => {
    expect(thinkingLabel(2_999)).toBe("Thinking…");
    expect(thinkingLabel(3_000)).toBe("Thinking… 3 s");
    expect(thinkingLabel(5_400)).toBe("Thinking… 5 s");
    expect(visibleText(renderToStaticMarkup(<ThinkingCard question={QUESTION} elapsedMs={14_999} model />))).not.toContain("busy");
    expect(visibleText(renderToStaticMarkup(<ThinkingCard question={QUESTION} elapsedMs={16_000} model />)).trim()).toBe(
      `${QUESTION} Thinking… 16 s The model is busy; this can take up to a minute.`,
    );
  });

  it("says Computing… for a follow-up or a re-run, which never reaches the model, and never that the model is busy", () => {
    expect(visibleText(renderToStaticMarkup(<ThinkingCard question={QUESTION} elapsedMs={16_000} model={false} />)).trim()).toBe(`${QUESTION} Computing…`);
    expect(spoken(region({ kind: "loading", startedAt: 0, model: false }))).toBe("Computing");
  });

  it("counts the seconds from when the question was sent, until stopped", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00Z"));
    const seen: string[] = [];
    const stop = elapsedTicker(Date.now(), (elapsedMs) => seen.push(thinkingLabel(elapsedMs)));
    vi.advanceTimersByTime(2_000);
    expect(seen.at(-1)).toBe("Thinking…");
    vi.advanceTimersByTime(3_000);
    expect(seen.at(-1)).toBe("Thinking… 5 s");
    vi.advanceTimersByTime(11_000);
    expect(seen.at(-1)).toBe("Thinking… 16 s");
    stop();
    const count = seen.length;
    vi.advanceTimersByTime(5_000);
    expect(seen).toHaveLength(count);
  });
});

describe("the answer region for assistive technology (ticket 30)", () => {
  it("is busy while the model works, and says Thinking once", () => {
    const html = region({ kind: "loading", startedAt: 0, model: true });
    expect(html).toMatch(/^<div[^>]*aria-busy="true"/);
    expect(spoken(html)).toBe("Thinking");
  });

  it("then says the answer's first sentence, no longer busy", () => {
    const answer = { ...answerFor({ metric: "on_time_rate" }), sentence: "82.2% of delivered orders arrived on time. That is 304 of 370." };
    const html = region({ kind: "answer", answer });
    expect(html).toMatch(/^<div[^>]*aria-busy="false"/);
    expect(spoken(html)).toBe("82.2% of delivered orders arrived on time.");
  });

  it("says a message's first sentence, and leaves an error to its alert", () => {
    expect(announcement({ kind: "no-data", message: "No data for 1 Jan–31 Dec 2024. The data covers 1 Jan–31 Dec 2025." })).toBe("No data for 1 Jan–31 Dec 2024.");
    expect(announcement({ kind: "error", message: "The server could not be reached. Try again.", details: [] })).toBe("");
    expect(announcement({ kind: "idle" })).toBe("");
  });
});

describe("the Ask button (ticket 30)", () => {
  it("spins and is disabled while a question is in flight, keeping its name", () => {
    const busy = renderToStaticMarkup(<AskButton busy disabled={false} />);
    expect(busy).toMatch(/^<button[^>]*disabled=""/);
    expect(busy).toContain("data-spinner");
    expect(visibleText(busy).trim()).toBe("Ask");
    const idle = renderToStaticMarkup(<AskButton busy={false} disabled={false} />);
    expect(idle).not.toContain("data-spinner");
    expect(idle).not.toContain("disabled");
  });
});
