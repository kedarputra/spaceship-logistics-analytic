import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { visibleText } from "@/components/markup-text";
import { type ActiveDataset, datasetOf, getDataset, type Order } from "@/domain/orders";
import { AskPage } from "./ask/ask-page";
import { AttentionPage } from "./attention/attention-page";
import { CarriersPage } from "./carriers/carriers-page";
import { DataPage } from "./data/data-page";
import { DeliveryPage } from "./delivery/delivery-page";
import { ForecastPage } from "./forecast/forecast-page";
import { ImportPage } from "./import/import-page";
import { InventoryPage } from "./inventory/inventory-page";
import { NetworkPage } from "./network/network-page";
import { OverviewPage } from "./overview-page";
import { ReportsPage } from "./reports/reports-page";
import { UsersPage } from "./users/users-page";

// Raw data's filters use the router, which only a browser has.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const { orders } = getDataset();
const imported = (rows: readonly Order[], name: string): ActiveDataset => datasetOf(rows, { csv: name, fileName: `${name}.csv`, imported: true });

/** Imports far smaller and narrower than the file, which every page must still draw (ticket 35). */
const IMPORTS: Record<string, ActiveDataset> = {
  "the template's five rows": imported(orders.slice(0, 5), "template"),
  "one order": imported(orders.slice(0, 1), "one"),
  "only orders in transit": imported(orders.filter((order) => order.status === "in_transit").slice(0, 3), "transit"),
  "only canceled orders": imported(orders.filter((order) => order.status === "canceled"), "canceled"),
  "one month": imported(orders.filter((order) => order.order_date.startsWith("2025-06")), "june"),
};

const noQuery = { searchParams: Promise.resolve({}) };
const PAGES: Record<string, (dataset: ActiveDataset) => ReactNode | Promise<ReactNode>> = {
  Overview: (dataset) => <OverviewPage role="admin" dataset={dataset} />,
  Ask: (dataset) => AskPage({ ...noQuery, dataset }),
  "Needs attention": (dataset) => <AttentionPage dataset={dataset} />,
  Carriers: (dataset) => <CarriersPage role="admin" dataset={dataset} />,
  "Raw data": (dataset) => DataPage({ ...noQuery, role: "admin", dataset }),
  Delivery: (dataset) => <DeliveryPage dataset={dataset} />,
  Forecast: (dataset) => ForecastPage({ ...noQuery, role: "admin", dataset }),
  Inventory: (dataset) => <InventoryPage dataset={dataset} />,
  Network: (dataset) => NetworkPage({ ...noQuery, dataset }),
  Reports: (dataset) => ReportsPage({ ...noQuery, role: "admin", dataset }),
  Users: (dataset) => <UsersPage dataset={dataset} />,
  Import: (dataset) => <ImportPage dataset={dataset} />,
};

describe("every page draws on a small import (ticket 35)", () => {
  const cases = Object.keys(IMPORTS).flatMap((data) => Object.keys(PAGES).map((page) => [page, data] as const));

  it.each(cases)("%s, on %s", async (page, data) => {
    const dataset = IMPORTS[data];
    const draw = PAGES[page];
    if (dataset === undefined || draw === undefined) throw new Error(`No case ${page} on ${data}`);
    const text = visibleText(renderToStaticMarkup(await draw(dataset)));
    expect(text).toContain(`Data as of `);
    expect(text).not.toContain("NaN");
  });
});
