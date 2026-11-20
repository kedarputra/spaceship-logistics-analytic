import type { QueryResult, ResultRow } from "@/tools/query";

/**
 * The group a ranking names (ADR 0001 §6), as the query tool computed it: the top group when it has
 * enough deliveries, else the first that does, else none. A breakdown by a category with the
 * small-sample rule is always ranked; anything else is a bug upstream, so it throws.
 */
export function reliableLeader(result: QueryResult): { leader: ResultRow | undefined; top: ResultRow; minDelivered: number; topIsSmall: boolean } {
  const { ranking } = result;
  if (ranking === undefined) throw new Error(`${result.metric.label} by ${result.spec.groupBy ?? "nothing"} is not ranked`);
  const leader = ranking.case === "reliable" ? ranking.top : ranking.topReliable;
  return { leader, top: ranking.top, minDelivered: ranking.minDelivered, topIsSmall: ranking.case !== "reliable" };
}
