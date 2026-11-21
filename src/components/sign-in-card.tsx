import type { ReactNode } from "react";
import { Icon } from "./icons";

/** The sign-in page's card (ticket 31): the product's mark and name, then the form or why there is none. */
export function SignInCard({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="sign-in-title" className="card flex w-full max-w-[380px] flex-col gap-6 p-6 shadow-raised sm:p-7">
      <div className="flex items-center gap-2.5">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-control bg-chip text-grey-green">
          <Icon name="box" size={20} />
        </span>
        <h1 id="sign-in-title" className="text-card-title">
          Logistics Analytics
        </h1>
      </div>
      {children}
    </section>
  );
}
