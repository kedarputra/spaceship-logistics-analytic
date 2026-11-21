import { withRole } from "../auth";
import { AskPage, type AskPageProps } from "./ask-page";

/** `/ask`: Ask the data, for analysts and admins; a viewer gets the 403 page (ticket 31). */
export default withRole<AskPageProps>("ask", AskPage);
