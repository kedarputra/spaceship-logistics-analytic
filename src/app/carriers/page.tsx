import { withRole } from "../auth";
import { CarriersPage } from "./carriers-page";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** `/carriers`, for every role (ticket 31). */
export default withRole<object>("dashboards", CarriersPage);
