import { type Action, can, deniedMessage } from "./roles";
import { authSecret } from "./secret";
import { type Session, verifySession } from "./session";
import { type Account, accountsFromEnv, findAccount, type User, userOf } from "./users";

/**
 * Who is asking and what they may do (ticket 31, ADR 0012). The proxy has already checked the
 * session's signature and expiry; `requireRole` checks them again, finds the account in the users
 * file, and asks the matrix with the role the file gives it now. Pages and API routes call it
 * through src/app/auth.tsx.
 */

/** `session` is the verified cookie: its ID keeps the session's import apart (ticket 35), its expiry bounds it. */
export type SignedIn = { kind: "not-configured" } | { kind: "signed-out" } | { kind: "signed-in"; user: User; session: Session };

export type Access =
  | { kind: "not-configured" }
  | { kind: "signed-out" }
  | { kind: "forbidden"; user: User; message: string }
  | { kind: "allowed"; user: User; session: Session };

let reported = "";

/** Logs why sign-in is off, once per new reason. The reasons never hold a secret or a path. */
function report(problem: string): void {
  if (problem === reported) return;
  reported = problem;
  console.error(`Sign-in is off: ${problem}.`);
}

/** The session key and the accounts, when the server has both a usable secret and a usable users file. */
export function signInSetup(): { key: Buffer; accounts: readonly Account[] } | undefined {
  const secret = authSecret();
  if (!secret.ok) {
    report(secret.problem);
    return undefined;
  }
  const accounts = accountsFromEnv();
  if (!accounts.ok) {
    report(accounts.problem);
    return undefined;
  }
  reported = "";
  return { key: secret.key, accounts: accounts.accounts };
}

/** Whether anyone can sign in on this server; /login says so when not. */
export function authConfigured(): boolean {
  return signInSetup() !== undefined;
}

/** Who a session token belongs to now: verified, and found in the users file with its current role. */
export function userFor(token: string | undefined, now = Date.now()): SignedIn {
  const setup = signInSetup();
  if (setup === undefined) return { kind: "not-configured" };
  const session = verifySession(token, setup.key, now);
  const account = session && findAccount(setup.accounts, session.username);
  return session === undefined || account === undefined ? { kind: "signed-out" } : { kind: "signed-in", user: userOf(account), session };
}

export function requireRole(token: string | undefined, action: Action, now = Date.now()): Access {
  const signedIn = userFor(token, now);
  if (signedIn.kind !== "signed-in") return signedIn;
  const { user, session } = signedIn;
  if (!can(user.role, action)) return { kind: "forbidden", user, message: deniedMessage(user.role, action) };
  return { kind: "allowed", user, session };
}
