import { withRole } from "../auth";
import { DataPage, type DataPageProps } from "./data-page";

/** `/data`, Raw data, for every role; the CSV download is for analysts and admins (ticket 31). */
export default withRole<DataPageProps>("dashboards", DataPage);
