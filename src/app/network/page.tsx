import { withRole } from "../auth";
import { NetworkPage, type NetworkPageProps } from "./network-page";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** `/network`, for every role: a dashboard page (ticket 33, ADR 0012 §1). */
export default withRole<NetworkPageProps>("dashboards", NetworkPage);
