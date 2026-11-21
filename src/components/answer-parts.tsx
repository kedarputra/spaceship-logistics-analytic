"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { SentenceSource } from "@/tools/answer";
import { CollapsibleRegion, DisclosureChevron, useDisclosure } from "./collapsible";
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

/**
 * An explanation panel (ADR 0006 §7): everything needed to check the answer, in a card whose heading
 * opens it. Closed by default (ticket 30): the answer comes first, how it was computed one click away.
 */
export function ExplanationCard({ title, children }: { title: string; children: ReactNode }) {
  const { button, region } = useDisclosure();
  return (
    <section data-explanation className="card p-5 text-small">
      <button type="button" {...button} className="group flex min-h-[34px] w-full cursor-pointer items-center gap-2 text-left">
        <DisclosureChevron turn="panel" />
        <span className="text-card-title">{title}</span>
      </button>
      <CollapsibleRegion {...region}>
        <div className="flex flex-col gap-4 pt-4">{children}</div>
      </CollapsibleRegion>
    </section>
  );
}

/**
 * What was computed, as a row of chips under the answer (R5, ticket 30): always in view, while how it
 * was computed waits in its collapsible.
 */
export function ComputedChips({ chips }: { chips: readonly string[] }) {
  return (
    <ul aria-label="What was computed" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip} className="inline-flex min-h-6 items-center rounded-full border border-chip-line bg-chip px-2.5 text-note text-ink-2">
          {chip}
        </li>
      ))}
    </ul>
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
