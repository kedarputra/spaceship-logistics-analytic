import type { Dataset } from "@/domain/orders";
import { type QueryResult, runQuery } from "@/tools/query";
import type { QuerySpec } from "@/tools/spec";

/**
 * A page's query over all of its dataset, through the query tool the answers use (ADR 0011 §6). A page
 * asks only for data that exists, so "no data" is a bug and throws.
 */
export function queryResult(spec: Omit<QuerySpec, "tool">, dataset: Dataset): QueryResult {
  const result = runQuery({ tool: "query", ...spec }, dataset);
  if (result.kind !== "result") throw new Error(result.message);
  return result;
}
