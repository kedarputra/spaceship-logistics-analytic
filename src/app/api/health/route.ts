import { getDataset } from "@/domain/orders";

/** One request after a deploy confirms the dataset shipped and parsed (ADR 0005). */
export function GET(): Response {
  const { orders, anchor } = getDataset();
  return Response.json({ rows: orders.length, anchor });
}
