import Link from "next/link";
import { type Action, deniedMessage, type Role } from "@/auth/roles";
import { SignInAgain } from "./sign-in-again";

/** The 403 page (ticket 31): what the role can't open, and the two ways on. */
export function Forbidden({ role, action }: { role: Role; action: Action }) {
  return (
    <section aria-labelledby="forbidden-title" className="card card-body max-w-[640px] gap-5 py-7">
      <div className="flex flex-col gap-1">
        <span className="text-label text-muted uppercase">No access</span>
        <h1 id="forbidden-title" className="text-title text-balance">
          {deniedMessage(role, action)}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href="/" className="button-primary h-10 px-5 no-underline hover:text-ink">
          Overview
        </Link>
        <SignInAgain />
      </div>
    </section>
  );
}
