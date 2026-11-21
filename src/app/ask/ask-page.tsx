import { AskWorkspace } from "@/components/ask-workspace";
import { PageHeader } from "@/components/page-header";
import type { Dataset } from "@/domain/orders";

export interface AskPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The Ask page (ADR 0011 §5, ticket 24): the AI workspace. A question in `q`, from the Overview's ask
 * box or a link, is asked when the page opens; a new `q` starts a fresh workspace.
 */
export async function AskPage({ searchParams, dataset }: AskPageProps & { dataset: Dataset }) {
  const { q } = await searchParams;
  const asked = (Array.isArray(q) ? q[0] : q)?.trim();
  const initialQuestion = asked === undefined || asked === "" ? undefined : asked;
  const { orders, anchor } = dataset;
  return (
    <>
      <PageHeader label="Ask the data" title="Ask about the data" asOf={anchor} />
      <AskWorkspace key={initialQuestion} initialQuestion={initialQuestion} orderCount={orders.length} />
    </>
  );
}
