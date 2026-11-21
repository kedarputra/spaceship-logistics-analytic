import { handleLogin } from "./handle-login";
import { loginLimiter } from "./login-limits";

/** POST /api/login {username, password, next}: signs in (ticket 31). Public, like /login. */
export function POST(request: Request): Promise<Response> {
  return handleLogin(request, { limiter: loginLimiter(), now: Date.now });
}
