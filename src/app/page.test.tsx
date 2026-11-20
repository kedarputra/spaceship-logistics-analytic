import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardPage from "./page";

describe("dashboard page", () => {
  it('is headed "Data as of 31 Dec 2025"', () => {
    expect(renderToStaticMarkup(<DashboardPage />)).toContain("Data as of 31 Dec 2025");
  });
});
