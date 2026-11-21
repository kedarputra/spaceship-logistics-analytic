/**
 * The spec filters Raw data reads from its URL as lists of values, in the order its URL and chips give
 * them (tickets 28, 33). No imports, so an answer in the browser can write a link to its orders without
 * loading the data.
 */
export const LIST_FILTERS = ["status", "carrier", "region", "warehouse", "origin", "destination", "category", "client", "sku"] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];

/**
 * The lists the filter bar offers as menus, in its order. Destination (47 cities) and SKU (355) have too
 * many values for a menu: a link or the URL sets them, and they show as chips (ticket 33).
 */
export const MENU_FILTERS = ["status", "carrier", "region", "warehouse", "origin", "category", "client"] as const satisfies readonly ListFilter[];
export type MenuFilter = (typeof MENU_FILTERS)[number];

/** The lists with no menu: a link or the URL sets them, a chip removes them, and the form carries them over. */
export const URL_ONLY_FILTERS: readonly ListFilter[] = LIST_FILTERS.filter((filter) => !MENU_FILTERS.some((menu) => menu === filter));
