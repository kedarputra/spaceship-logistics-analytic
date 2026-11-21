/**
 * The roles and what each may do (ticket 31, ADR 0012): the one matrix that pages, API routes and the
 * rail all ask, through `can`. A later ticket adds its action here rather than a check of its own.
 * No imports, so the browser can use it too.
 */

export const ROLES = ["viewer", "analyst", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAMES: Record<Role, string> = { viewer: "Viewer", analyst: "Analyst", admin: "Admin" };

/**
 * - dashboards: Overview, Delivery, Carriers, Forecast, Raw data, and the pages tickets 32–34 add
 * - ask: Ask the data, /api/ask and /api/run
 * - download: /api/orders.csv and the report files of ticket 34
 * - import: importing data (ticket 35)
 * - users: the read-only list of accounts and their roles
 */
export const ACTIONS = ["dashboards", "ask", "download", "import", "users"] as const;
export type Action = (typeof ACTIONS)[number];

const ALLOWED: Record<Action, readonly Role[]> = {
  dashboards: ["viewer", "analyst", "admin"],
  ask: ["analyst", "admin"],
  download: ["analyst", "admin"],
  import: ["admin"],
  users: ["admin"],
};

/** The action as "Your role, Viewer, can't …" ends. */
const ACTION_WORDS: Record<Action, string> = {
  dashboards: "open the dashboards",
  ask: "open Ask the data",
  download: "download data",
  import: "import data",
  users: "open Users",
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED[action].includes(role);
}

export function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}

/** "Your role, Viewer, can't open Ask the data.": the 403 page's sentence, and a 403 response's error. */
export function deniedMessage(role: Role, action: Action): string {
  return `Your role, ${ROLE_NAMES[role]}, can't ${ACTION_WORDS[action]}.`;
}
