import { withRole } from "../auth";
import { UsersPage } from "./users-page";

/** `/users`: the accounts and their roles, for admins only (ticket 31). */
export default withRole<object>("users", UsersPage);
