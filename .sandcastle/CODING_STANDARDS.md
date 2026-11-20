# Coding standards

The reviewer agent loads this file. The stack is chosen during planning (see `docs/adr/`); these rules hold whatever it is.

## Structure

- Keep three layers apart, as the brief asks: **AI interpretation** (question to a validated query spec), **computation** (pure functions over the dataset), and **presentation** (API responses and UI). The AI layer never imports UI code, and computation never calls the LLM.
- Computation functions are pure: same input, same output, no network, no clock. "Today" is passed in, and it defaults to the dataset anchor date (see `docs/data.md`).
- One module owns KPI and metric definitions. The dashboard and the natural-language answers both call it, so the same question always gets the same number.

## Correctness

- Every KPI, aggregation, and forecast has a unit test whose expected value was computed independently from `data/mock_logistics_data.csv`.
- The query spec has a schema (for example zod). Unknown metrics, dimensions, filters, or chart types are rejected with a clear message, never guessed.
- Dates are handled as calendar dates (`YYYY-MM-DD`), not timestamps with time zones.
- Divisions guard against zero; rates are shown with their numerator and denominator in the explainability data.

## AI usage in code

- LLM calls request structured output and are validated before use. Malformed output is retried once, then the user gets an honest error.
- Prompts and model IDs live in one place. The model is read from configuration, never hard-coded in several files.
- When a question is ambiguous or out of scope, say so and suggest a supported question instead of improvising an answer.

## Style

- TypeScript `strict`. No `any` and no unchecked casts.
- Clear names over clever code; no nested ternaries.
- No commented-out code, no TODO comments, no secrets.

## Tests and checks

- The commands under "Checks" in `CLAUDE.md` must pass before a commit.
- A bug fix starts with a failing test that reproduces it.
