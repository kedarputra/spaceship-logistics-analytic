import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ActiveDataset, getDataset } from "@/domain/orders";
import { createImportStore, IMPORT_LIFETIME_MS, MAX_IMPORTS } from "./import-store";

const HOUR = 60 * 60 * 1000;
const START = Date.UTC(2026, 10, 22, 2, 0, 0);
/** A session that lasts the full 8 hours from START. */
const SESSION_ENDS = START + 8 * HOUR;

/** An imported dataset named `fileName`: the file's first order, under another name and ID. */
function imported(fileName: string): ActiveDataset {
  return { ...getDataset(), orders: getDataset().orders.slice(0, 1), id: `id-${fileName}`, fileName, imported: true };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe("the imports in memory (ticket 35)", () => {
  it("keeps an import under its session ID, for that session only", () => {
    const store = createImportStore();
    store.put("session-a", imported("a.csv"), SESSION_ENDS);
    expect(store.get("session-a")?.fileName).toBe("a.csv");
    expect(store.get("session-b")).toBeUndefined();
  });

  it(`keeps at most ${MAX_IMPORTS}: a fourth session's import evicts the oldest`, () => {
    expect(MAX_IMPORTS).toBe(3);
    const store = createImportStore();
    for (const name of ["a", "b", "c"]) {
      store.put(name, imported(`${name}.csv`), SESSION_ENDS);
      vi.advanceTimersByTime(60_000);
    }
    store.put("d", imported("d.csv"), SESSION_ENDS);
    expect(["a", "b", "c", "d"].map((name) => store.get(name)?.fileName)).toEqual([undefined, "b.csv", "c.csv", "d.csv"]);
    expect(store.size()).toBe(3);
  });

  it("replaces a session's own import without evicting anyone, and counts it as the newest", () => {
    const store = createImportStore();
    for (const name of ["a", "b", "c"]) store.put(name, imported(`${name}.csv`), SESSION_ENDS);
    store.put("a", imported("a2.csv"), SESSION_ENDS);
    expect(["a", "b", "c"].map((name) => store.get(name)?.fileName)).toEqual(["a2.csv", "b.csv", "c.csv"]);
    store.put("d", imported("d.csv"), SESSION_ENDS);
    expect(store.get("b")).toBeUndefined();
    expect(store.get("a")?.fileName).toBe("a2.csv");
  });

  it("drops an import 2 hours after it was made, and never serves it after", () => {
    expect(IMPORT_LIFETIME_MS).toBe(2 * HOUR);
    const store = createImportStore();
    store.put("a", imported("a.csv"), SESSION_ENDS);
    vi.advanceTimersByTime(2 * HOUR - 1);
    expect(store.get("a")?.fileName).toBe("a.csv");
    vi.advanceTimersByTime(1);
    expect(store.get("a")).toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it("never outlives the session it belongs to", () => {
    const store = createImportStore();
    store.put("a", imported("a.csv"), START + 30 * 60 * 1000);
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(store.get("a")).toBeUndefined();
  });

  it("drops expired imports before evicting one that is still in use", () => {
    const store = createImportStore();
    store.put("old", imported("old.csv"), SESSION_ENDS);
    vi.advanceTimersByTime(HOUR + 1);
    store.put("b", imported("b.csv"), SESSION_ENDS);
    store.put("c", imported("c.csv"), SESSION_ENDS);
    vi.advanceTimersByTime(HOUR);
    // "old" is now 2 hours old: it goes, and b and c both stay.
    store.put("d", imported("d.csv"), SESSION_ENDS);
    expect(["old", "b", "c", "d"].map((name) => store.get(name)?.fileName)).toEqual([undefined, "b.csv", "c.csv", "d.csv"]);
  });

  it("forgets a session's import when told to, as signing out and Back to the original data do", () => {
    const store = createImportStore();
    store.put("a", imported("a.csv"), SESSION_ENDS);
    store.put("b", imported("b.csv"), SESSION_ENDS);
    store.remove("a");
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")?.fileName).toBe("b.csv");
  });
});
