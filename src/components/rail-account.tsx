import { ROLE_NAMES } from "@/auth/roles";
import type { User } from "@/auth/users";
import { Icon } from "./icons";

/**
 * The rail's footer (ticket 31): who is signed in, their role as a chip, and Sign out, a POST that
 * clears the session and returns to /login. On the collapsed rail the two icons keep their place, with
 * the words as their tooltips; the words stay for screen readers.
 */
export function RailAccount({ user }: { user: User }) {
  const role = ROLE_NAMES[user.role];
  return (
    <div className="flex flex-col gap-0.5 border-t border-panel/8 pt-3">
      <div data-tip={`${user.username} · ${role}`} className="flex min-h-10 items-center gap-2.5 px-3 whitespace-nowrap">
        <Icon name="user" className="shrink-0 text-sage" />
        <span className="rail-fade flex min-w-0 items-center gap-2">
          <span className="truncate text-small font-medium text-panel">{user.username}</span>
          <span className="rounded-tag bg-sage/16 px-1.5 py-px text-label font-semibold text-sage">{role}</span>
        </span>
      </div>
      <form method="post" action="/api/logout">
        <button
          type="submit"
          data-tip="Sign out"
          className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-control px-3 text-left whitespace-nowrap text-rail-ink hover:bg-panel/6 hover:text-panel"
        >
          <Icon name="sign-out" className="shrink-0" />
          <span className="rail-fade">Sign out</span>
        </button>
      </form>
    </div>
  );
}
