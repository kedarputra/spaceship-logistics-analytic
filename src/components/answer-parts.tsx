import Link from "next/link";
import type { ReactNode } from "react";
import type { SentenceSource } from "@/tools/answer";
import { Icon } from "./icons";

/** The parts an answer and a forecast share on the Ask page (ADR 0011): the question, who wrote the sentence, and the explanation panel. */

/** The question an answer replies to, above its sentence. */
export function AskedQuestion({ question }: { question: string | undefined }) {
  if (question === undefined) return null;
  return (
    <p className="flex items-center gap-2 text-small text-muted">
      <Icon name="reply" size={15} className="shrink-0 text-grey-green" />
      {question}
    </p>
  );
}

/** Who wrote the sentence: the model, with every number checked by the guard, or code from the result (ADR 0009 §4). */
export function SentenceBadge({ source }: { source: SentenceSource }) {
  return source === "model" ? (
    <span className="pill bg-ok-tint text-green-text">
      <Icon name="check" size={13} strokeWidth={2.2} />
      Written by the model, every number checked
    </span>
  ) : (
    <span className="pill bg-track text-ink-2">Written by code from the result</span>
  );
}

/** An explanation panel (ADR 0006 §7): a card, open on the Ask page, with everything needed to check the answer. */
export function ExplanationCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details open className="group card p-5 text-small">
      <summary className="flex min-h-[34px] cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <Icon name="chevron" size={16} strokeWidth={2} className="transition-transform group-open:rotate-90" />
        <span className="text-card-title">{title}</span>
      </summary>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}

/** A heading inside an explanation panel. */
export function PanelHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-label text-muted uppercase">{children}</h3>;
}

/** The spec as JSON, on the rail's dark ground. */
export function SpecBlock({ spec }: { spec: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-control bg-rail px-3.5 py-3 font-mono text-caption leading-relaxed text-rail-ink">{JSON.stringify(spec, null, 2)}</pre>
  );
}

/** A link out of an explanation panel to where the answer's data is shown in full (ticket 29). */
export function PanelLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-[34px] items-center gap-1.5 self-start font-semibold no-underline">
      {children}
      <Icon name="chevron" size={14} strokeWidth={2} />
    </Link>
  );
}
