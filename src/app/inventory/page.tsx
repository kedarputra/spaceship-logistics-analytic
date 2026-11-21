import { withRole } from "../auth";
import { InventoryPage } from "./inventory-page";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** `/inventory`, for every role: a dashboard page (ticket 33, ADR 0012 §1). */
export default withRole<object>("dashboards", InventoryPage);
