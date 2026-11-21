import { withRole } from "./auth";
import { OverviewPage } from "./overview-page";

// Rendered per request from the dataset this server instance loaded, like /api/health.
export const dynamic = "force-dynamic";

/** `/`: the Overview, for every role (ticket 31). */
export default withRole<object>("dashboards", OverviewPage);
