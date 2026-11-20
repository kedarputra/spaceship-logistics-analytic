import type { ReactNode } from "react";

/** Words with a swatch of their chart mark beside them, so a breakdown or legend never rests on colour alone. */
export function Marked({ mark, children }: { mark: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2.5 rounded-mark ${mark}`} />
      {children}
    </span>
  );
}
