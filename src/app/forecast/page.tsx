import { withRole } from "../auth";
import { ForecastPage, type ForecastPageProps } from "./forecast-page";

/** `/forecast`, for every role (ticket 31). */
export default withRole<ForecastPageProps>("dashboards", ForecastPage);
