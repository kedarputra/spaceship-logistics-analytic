"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * The 403 page's "Sign in as someone else" (ticket 31): signs out, then opens /login with this page to
 * come back to. A form, since signing out changes state; it looks like a link.
 */
export function SignInAgain() {
  const pathname = usePathname() ?? "";
  const query = useSearchParams()?.toString() ?? "";
  const here = query === "" ? pathname : `${pathname}?${query}`;
  return (
    <form method="post" action="/api/logout">
      <input type="hidden" name="next" value={here} />
      <button type="submit" className="cursor-pointer font-semibold text-green-text underline-offset-[3px] hover:text-ink hover:underline">
        Sign in as someone else
      </button>
    </form>
  );
}
