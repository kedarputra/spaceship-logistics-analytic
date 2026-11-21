import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireRole, userFor } from "@/auth/access";
import type { Action, Role } from "@/auth/roles";
import { cookieValue, SESSION_COOKIE, type Session } from "@/auth/session";
import { NOT_CONFIGURED, SIGNED_OUT } from "@/auth/sign-in";
import type { User } from "@/auth/users";
import { Forbidden } from "@/components/forbidden";
import type { ActiveDataset } from "@/domain/orders";
import { getActiveDataset } from "./active-dataset";
import { errorResponse } from "./api/body";
import { privateNoStore } from "./api/no-store";

/**
 * requireRole in Next's terms (ticket 31, ADR 0012). Every page is exported through `withRole` and
 * every API route but the public ones through `withApiRole`, each naming its action in the matrix
 * (src/auth/roles.ts). The proxy has already turned away requests without a valid session; these
 * check again, find the account in the users file, and ask the matrix with its current role. Each
 * also hands its page or route the session's active dataset (ticket 35): the session's import, or the file.
 */

async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Who is signed in now, for the sign-in page; undefined when no one is. */
export async function currentUser(): Promise<User | undefined> {
  return (await currentViewer())?.user;
}

/** Who is signed in now and the data their session runs on, for the layout's rail and banner; undefined when no one is. */
export async function currentViewer(): Promise<{ user: User; dataset: ActiveDataset } | undefined> {
  const signedIn = userFor(await sessionToken());
  if (signedIn.kind !== "signed-in") return undefined;
  return { user: signedIn.user, dataset: getActiveDataset(signedIn.session.sessionId) };
}

/** What a page gets besides its own props: the viewer's role and the session's active dataset. */
export interface PageContext {
  role: Role;
  dataset: ActiveDataset;
}

/**
 * A page that needs `action`: the page with the viewer's role and the session's active dataset, the
 * 403 page when the role may not, or /login when the account has gone since the proxy let the request in.
 */
export function withRole<Props extends object>(action: Action, Page: (props: Props & PageContext) => ReactNode | Promise<ReactNode>) {
  return async function PageForRole(props: Props): Promise<ReactNode> {
    const access = requireRole(await sessionToken(), action);
    if (access.kind === "signed-out" || access.kind === "not-configured") redirect("/login");
    if (access.kind === "forbidden") return <Forbidden role={access.user.role} action={action} />;
    return Page({ ...props, role: access.user.role, dataset: getActiveDataset(access.session.sessionId) });
  };
}

/** What an API route's handler gets besides the request: who asked, their verified session, and its active dataset. */
export interface RouteContext {
  user: User;
  session: Session;
  dataset: ActiveDataset;
}

/**
 * An API route that needs `action`: 401, 403 or 503 JSON when it may not run, else the handler. Every
 * answer, a file download or a refusal, is `private, no-store`, so the CDN in front never serves one
 * user's response to another (ADR 0012, amended).
 */
export function withApiRole(action: Action, handler: (request: Request, context: RouteContext) => Response | Promise<Response>) {
  return async function routeForRole(request: Request): Promise<Response> {
    const access = requireRole(cookieValue(request.headers.get("cookie"), SESSION_COOKIE), action);
    if (access.kind === "not-configured") return privateNoStore(errorResponse(503, NOT_CONFIGURED));
    if (access.kind === "signed-out") return privateNoStore(errorResponse(401, SIGNED_OUT));
    if (access.kind === "forbidden") return privateNoStore(errorResponse(403, access.message));
    const { user, session } = access;
    return privateNoStore(await handler(request, { user, session, dataset: getActiveDataset(session.sessionId) }));
  };
}
