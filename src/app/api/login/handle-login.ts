import { z } from "zod";
import { signInSetup } from "@/auth/access";
import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH, normalizeUsername } from "@/auth/credentials";
import { safeNextPath } from "@/auth/next-path";
import { sessionCookie, signSession } from "@/auth/session";
import { checkCredentials, NOT_CONFIGURED, WRONG_CREDENTIALS } from "@/auth/sign-in";
import { errorResponse, readJsonBody } from "../body";
import { CROSS_SITE, sameOrigin } from "../origin";
import { ipKey } from "../rate-limit";
import { type LoginLimiter, tooManyTries } from "./login-limits";

/**
 * POST /api/login {username, password, next} (ticket 31, ADR 0012). From a page of this site only;
 * within the sign-in limits; one answer for a wrong username or password. On success, the session
 * cookie and where to go next, which is followed only when it is a relative path on this site.
 */

const bodySchema = z.object({
  username: z.string().trim().min(1).max(MAX_USERNAME_LENGTH),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  next: z.string().max(4096).optional(),
});

export interface LoginDependencies {
  limiter: LoginLimiter;
  now: () => number;
}

export async function handleLogin(request: Request, { limiter, now }: LoginDependencies): Promise<Response> {
  if (!sameOrigin(request.headers)) return errorResponse(403, CROSS_SITE);
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const body = bodySchema.safeParse(read.body);
  if (!body.success) return errorResponse(400, "Enter a username and a password.");

  const setup = signInSetup();
  if (setup === undefined) return errorResponse(503, NOT_CONFIGURED);

  const username = normalizeUsername(body.data.username);
  const decision = limiter.take(ipKey(request.headers), username, now());
  if (!decision.allowed) {
    const seconds = decision.retryAfterSeconds;
    return Response.json({ error: tooManyTries(seconds), retryAfterSeconds: seconds }, { status: 429, headers: { "retry-after": String(seconds) } });
  }

  const user = await checkCredentials(setup.accounts, username, body.data.password);
  if (user === undefined) return errorResponse(401, WRONG_CREDENTIALS);
  decision.succeeded();
  return Response.json(
    { next: safeNextPath(body.data.next) },
    { headers: { "set-cookie": sessionCookie(signSession(user, setup.key, now())), "cache-control": "no-store" } },
  );
}
