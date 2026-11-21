import { withRole } from "../auth";
import { ImportPage } from "./import-page";

// Rendered per request: its date is the session's active dataset's.
export const dynamic = "force-dynamic";

/** `/import`: check a CSV and view the app on it for this session, admins only (ticket 35, ADR 0012 §1). */
export default withRole<object>("import", ImportPage);
