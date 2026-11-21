import { withRole } from "../auth";
import { ReportsPage, type ReportsPageProps } from "./reports-page";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** `/reports`, for every role to read (ticket 34, ADR 0012 §1); its downloads ask for `download`. */
export default withRole<ReportsPageProps>("dashboards", ReportsPage);
