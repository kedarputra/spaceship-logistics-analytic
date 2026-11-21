import Link from "next/link";
import type { InputHTMLAttributes } from "react";
import { MAX_QUESTION_LENGTH } from "@/tools/examples";
import { CardTitle } from "./card-title";
import { Icon } from "./icons";
import { Spinner } from "./spinner";

/** The Ask page with a question to ask on load. */
export function askHref(question: string): string {
  return `/ask?${new URLSearchParams({ q: question })}`;
}

/** The question input and its label, on the Overview and the Ask page: the same limit and wording on both. */
export function QuestionField({ id, className, ...input }: { id: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "maxLength" | "placeholder">) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Your question
      </label>
      <input
        id={id}
        maxLength={MAX_QUESTION_LENGTH}
        placeholder="Ask about orders, deliveries, carriers or demand"
        className={`field ${className ?? ""}`}
        {...input}
      />
    </>
  );
}

/**
 * The Ask page's submit button (ticket 30). While a question is in flight it spins and is disabled; the
 * word stays, unseen, so the button keeps its name and its width.
 */
export function AskButton({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  return (
    <button type="submit" disabled={busy || disabled} className="button-primary relative h-12 px-6">
      <span className={busy ? "opacity-0" : undefined}>Ask</span>
      {busy ? <Spinner /> : null}
    </button>
  );
}

/**
 * The Overview's ask box (ticket 24): a plain form that opens the Ask page with the question in `q`,
 * so it works before any script loads, and a chip for each example question.
 */
export function AskBox({ questions }: { questions: readonly string[] }) {
  return (
    <section aria-labelledby="ask-title" className="card flex flex-col gap-4 p-5 shadow-raised">
      <div className="flex items-center gap-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-amber/14 text-amber-ink">
          <Icon name="ask" />
        </span>
        <CardTitle id="ask-title" title="Ask about the data" info={["Ask in plain language. The answer opens on the Ask page, with how it was computed."]} />
      </div>
      <form action="/ask" method="get" className="flex flex-wrap gap-2">
        <QuestionField id="overview-question" name="q" required className="flex-[1_1_260px]" />
        <button type="submit" className="button-primary">
          Ask
        </button>
      </form>
      <ul className="flex flex-wrap gap-2" aria-label="Example questions">
        {questions.map((question) => (
          <li key={question}>
            <Link href={askHref(question)} className="chip">
              {question}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
