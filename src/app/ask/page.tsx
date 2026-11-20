import { AskWorkspace } from "@/components/ask-workspace";
import { PageHeader } from "@/components/page-header";
import { getDataset } from "@/domain/orders";
import { QUESTIONS_PER_MINUTE } from "../api/rate-limit";

/**
 * The Ask page (ADR 0011 §5, ticket 24): the AI workspace. A question in `q`, from the Overview's ask
 * box or a link, is asked when the page opens; a new `q` starts a fresh workspace.
 */
export default async function AskPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { q } = await searchParams;
  const asked = (Array.isArray(q) ? q[0] : q)?.trim();
  const initialQuestion = asked === undefined || asked === "" ? undefined : asked;
  return (
    <>
      <PageHeader
        label="Ask the data"
        title="Ask about the data"
        description="The AI turns your question into a query spec. Code checks the spec against a whitelist and computes the answer; the AI only words it."
      />
      <AskWorkspace key={initialQuestion} initialQuestion={initialQuestion} questionsPerMinute={QUESTIONS_PER_MINUTE} orderCount={getDataset().orders.length} />
    </>
  );
}
