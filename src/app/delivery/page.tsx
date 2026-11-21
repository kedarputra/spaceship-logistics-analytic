import { withRole } from "../auth";
import { DeliveryPage } from "./delivery-page";

// Rendered per request from the dataset this server instance loaded, like the Overview.
export const dynamic = "force-dynamic";

/** `/delivery`, for every role (ticket 31). */
export default withRole<object>("dashboards", DeliveryPage);
