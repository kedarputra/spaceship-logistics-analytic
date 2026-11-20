import type { ReactNode } from "react";

const TONES = {
  /** A small sample. */
  warn: "bg-warn-tint text-warn-ink",
  /** A note such as "first with n ≥ 20" or "rough". */
  neutral: "bg-track text-ink-2",
} as const;

/** A short tag beside a name: "small sample", "first with n ≥ 20", "rough". Words, never colour alone. */
export function Tag({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={`rounded-tag px-1.5 py-px text-label font-semibold tracking-normal normal-case ${TONES[tone]}`}>{children}</span>;
}
