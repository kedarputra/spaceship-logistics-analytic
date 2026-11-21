/**
 * The spec filters the Raw data page offers as lists, in the order the page shows them (ticket 28).
 * No imports, so an answer in the browser can write a link to its orders without loading the data.
 */
export const LIST_FILTERS = ["status", "carrier", "region", "warehouse", "category"] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];
