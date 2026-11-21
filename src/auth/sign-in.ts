import { verifyAgainstNothing, verifyPassword } from "./password";
import { type Account, findAccount, type User, userOf } from "./users";

/** The one answer to a wrong username and to a wrong password alike (ticket 31). */
export const WRONG_CREDENTIALS = "Wrong username or password.";

/** What the sign-in page says when the server has no usable secret or users file. */
export const NOT_CONFIGURED = "Sign-in isn't configured on this server.";

/** An API route's 401: no session, an expired one, or an account that has been removed. */
export const SIGNED_OUT = "You are signed out. Sign in again.";

/**
 * The user a username and password belong to, or undefined. An unknown username still runs one hash,
 * against an account that matches nothing, so both failures take the same time.
 */
export async function checkCredentials(accounts: readonly Account[], username: string, password: string): Promise<User | undefined> {
  const account = findAccount(accounts, username);
  if (account === undefined) return verifyAgainstNothing(password).then(() => undefined);
  return (await verifyPassword(password, account.passwordHash)) ? userOf(account) : undefined;
}
