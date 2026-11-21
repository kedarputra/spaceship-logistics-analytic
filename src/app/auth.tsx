import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireRole, userFor } from "@/auth/access";
import type { Action, Role } from "@/auth/roles";
import { cookieValue, SESSION_COOKIE } from "@/auth/session";
import { NOT_CONFIGURED, SIGNED_OUT } from "@/auth/sign-in";
import type { User } from "@/auth/users";
import { Forbidden } from "@/components/forbidden";
import { errorResponse } from "./api/body";
import { privateNoStore } from "./api/no-store";

/**
 * requireRole in Next's terms (ticket 31, ADR 0012). Every page is exported through `withRole` and
 * every API route but the public ones through `withApiRole`, each naming its action in the matrix
 * (src/auth/roles.ts). The proxy has already turned away requests without a valid session; these
 * check again, find the account in the users file, and ask the matrix with its current role.
 */

async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Who is signed in now, for the layout's rail and the sign-in page; undefined when no one is. */
export async function currentUser(): Promise<User | undefined> {
  const signedIn = userFor(await sessionToken());
  return signedIn.kind === "signed-in" ? signedIn.user : undefined;
}

/**
 * A page that needs `action`: the page with the viewer's role, the 403 page when the role may not,
 * or /login when the account has gone since the proxy let the request in.
 */
export function withRole<Props extends object>(action: Action, Page: (props: Props & { role: Role }) => ReactNode | Promise<ReactNode>) {
  return async function PageForRole(props: Props): Promise<ReactNode> {
    const access = requireRole(await sessionToken(), action);
    if (access.kind === "signed-out" || access.kind === "not-configured") redirect("/login");
    if (access.kind === "forbidden") return <Forbidden role={access.user.role} action={action} />;
    return Page({ ...props, role: access.user.role });
  };
}

/**
 * An API route that needs `action`: 401, 403 or 503 JSON when it may not run, else the handler. Every
 * answer, a file download or a refusal, is `private, no-store`, so the CDN in front never serves one
 * user's response to another (ADR 0012, amended).
 */
export function withApiRole(action: Action, handler: (request: Request) => Response | Promise<Response>) {
  return async function routeForRole(request: Request): Promise<Response> {
    const access = requireRole(cookieValue(request.headers.get("cookie"), SESSION_COOKIE), action);
    if (access.kind === "not-configured") return privateNoStore(errorResponse(503, NOT_CONFIGURED));
    if (access.kind === "signed-out") return privateNoStore(errorResponse(401, SIGNED_OUT));
    if (access.kind === "forbidden") return privateNoStore(errorResponse(403, access.message));
    return privateNoStore(await handler(request));
  };
}
