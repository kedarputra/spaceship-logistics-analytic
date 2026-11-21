import { withRole } from "../auth";
import { AttentionPage } from "./attention-page";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** `/attention`, Needs attention, for every role: a dashboard page (ticket 32, ADR 0012 §1). */
export default withRole<object>("dashboards", AttentionPage);
