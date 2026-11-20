import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiStatusPill, RailAiStatus } from "./ai-status";
import { type AiStatus, aiStatusFrom, railStatusTip } from "./ai-status-state";

const DATA = { rows: 400, anchor: "2025-12-31" };

describe("the AI status from GET /api/health?ai=1 (ADR 0009 §11, ticket 24)", () => {
  it("is online when the model answered", () => {
    expect(aiStatusFrom(200, { ...DATA, ai: { up: true, model: "chat" } })).toEqual({ state: "online" });
  });

  it("is busy when the gateway answered without a free slot, or this visitor hit the rate limit", () => {
    expect(aiStatusFrom(200, { ...DATA, ai: { up: true, busy: true } })).toEqual({ state: "busy" });
    expect(aiStatusFrom(429, { error: "Too many questions in a minute, try again shortly." })).toEqual({ state: "busy" });
  });

  it("is unavailable when the AI is down or not configured, or the reply cannot be read", () => {
    expect(aiStatusFrom(503, { ...DATA, ai: { up: false, error: "AI unavailable right now. The dashboard still works." } })).toEqual({
      state: "unavailable",
    });
    expect(aiStatusFrom(200, "not json")).toEqual({ state: "unavailable" });
    expect(aiStatusFrom(500, undefined)).toEqual({ state: "unavailable" });
  });
});

describe("the AI status pill and the rail's status", () => {
  const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const states: [AiStatus, string][] = [
    [{ state: "checking" }, "Checking the AI…"],
    [{ state: "online" }, "AI online"],
    [{ state: "busy" }, "AI busy, try again shortly"],
    [{ state: "unavailable" }, "AI unavailable: the dashboard still works"],
  ];

  it.each(states)("says %j as %s, in words and not by colour alone", (status, words) => {
    expect(text(renderToStaticMarkup(<AiStatusPill status={status} />))).toBe(words);
  });

  it("names the model by its configured display name, not the gateway's alias, and says what the AI does (ticket 25)", () => {
    expect(text(renderToStaticMarkup(<RailAiStatus status={{ state: "online" }} modelName="Gemma 4 12B" dataFile="mock_logistics_data.csv" />))).toBe(
      "AI online Gemma 4 12B on this server. The AI routes and explains; code computes every number.",
    );
    expect(
      text(renderToStaticMarkup(<RailAiStatus status={{ state: "unavailable" }} modelName="Gemma 4 12B" dataFile="mock_logistics_data.csv" />)),
    ).toBe("AI unavailable: the dashboard still works Gemma 4 12B on this server. The AI routes and explains; code computes every number.");
  });

  it("gives the collapsed rail's dot a tooltip with the status, the model and the data file (ticket 27)", () => {
    expect(railStatusTip({ state: "online" }, "Gemma 4 12B", "mock_logistics_data.csv")).toBe(
      "AI online · Gemma 4 12B on this server · mock_logistics_data.csv",
    );
    expect(railStatusTip({ state: "busy" }, "Gemma 4 12B", "mock_logistics_data.csv")).toBe(
      "AI busy, try again shortly · Gemma 4 12B on this server · mock_logistics_data.csv",
    );
    const html = renderToStaticMarkup(<RailAiStatus status={{ state: "online" }} modelName="Gemma 4 12B" dataFile="mock_logistics_data.csv" />);
    expect(html).toContain('data-tip="AI online · Gemma 4 12B on this server · mock_logistics_data.csv"');
  });
});
