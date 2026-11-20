# Requirements

Restated from Spaceship's brief ("Coding assignment" and "AI-Powered Logistics Analytics Dashboard: Project Specification", both in the gitignored `docs/brief/`) and the recruiter's messages of 18 and 20 Nov 2026. Tickets and ADRs cite these IDs.

## Scoring

| Category | Weight | Mostly earned by |
|---|---|---|
| Product & UX | 15% | R1–R5, R13 |
| Frontend | 15% | R1, R2, R4, R5 |
| Backend & architecture | 20% | R7, R8, R10 |
| Data correctness | 20% | R1, R6, R8, `docs/data.md` |
| AI orchestration | 15% | R3, R7, R10 |
| Forecasting | 10% | R9 |
| Deployment | 5% | R11 |

Spaceship values clarity, correctness, and reasoning over completeness and polish. Expected effort is 6 to 10 hours. Do not over-engineer.

## Functional

- **R1 Dashboard KPIs.** At least: total orders, delivered orders, delayed orders, on-time delivery rate, average delivery time. Definitions: `docs/data.md`.
- **R2 Dashboard charts.** At least two, for example order volume over time, delivery performance (delayed vs on-time), and a carrier or destination breakdown.
- **R3 Natural-language questions.** Users ask in plain language; the system interprets the question, retrieves the data, and returns a direct answer, a chart, or both. It must handle at least:
  - "Show delayed orders by week for the last 3 months"
  - "Which carrier has the highest delay rate?"
  - "How many orders were delivered late last month?"
- **R4 Dynamic charts.** The system picks a suitable chart type automatically, renders it dynamically, and supports a defined subset of analytical queries.
- **R5 Explainability.** Every answer or chart shows the filters applied (such as the time range), the metrics and dimensions, the query plan or structured interpretation (recommended), and the underlying data as a table or summary.
- **R6 Data handling.** Use the provided dataset (`data/mock_logistics_data.csv`), treat it as read-only, and aggregate and filter correctly.

## AI orchestration

- **R7 AI as router.** The AI layer interprets the question, selects the computation path, calls the matching tool, and presents the result. It never answers without computation. Flow: question → AI interpretation → tool selection → structured input → computation → result → explanation → visualization.
- **R8 Query tool.** Dashboard queries, aggregations, and KPI calculations, for example "Show delayed orders by week" or "Which carrier has the highest delay rate?".
- **R9 Forecasting tool.** Predicts demand from the dataset's history with a basic method (moving average, linear regression, exponential smoothing, or a simple trend model). It returns forecast values, a chart of history plus forecast, an inventory recommendation, and an explanation of the method. Example questions: "Predict demand for SKU X for the next 4 months", "How much inventory should I plan?".
- **R10 Architecture.** Do not execute raw AI-generated SQL without validation; prefer structured query generation. Keep AI interpretation, data computation, and business logic clearly separate.

## Delivery

- **R11 Deployment.** A public URL, fully usable without local setup, stable for reviewers. Any platform. If there is a login, provide test credentials. No secrets in the repository. The recruiter asks for pay-as-you-go hosting rather than a free trial, so the app stays up during the review.
- **R12 README.** Must cover:
  - local setup instructions and environment variables;
  - a system overview, key design decisions, and the data flow;
  - how questions are interpreted and how tools are selected;
  - assumptions, simplifications, limitations, and unsupported queries;
  - future improvements.
- **R13 Loom walkthrough** (recruiter): a short video of the main flow and key features, highlighting the AI/LLM approach, how data and answer accuracy are ensured, and the key technical decisions and trade-offs. Shared as "anyone with the link can view" and not deleted after submission.
- **R14 AI disclosure.** Undisclosed AI usage may be treated negatively. State in the README how AI was used to build the project and which model the app calls.
- **R15 Submission.** Reply-all to Spaceship's email with the repository link, the deployed URL, credentials if any, and the Loom link. Details and timeline: `docs/submission.md`.

## Bonus (optional)

- **B1** Query history
- **B2** Caching
- **B3** Tests
- **B4** Docker setup
- **B5** Advanced explainability
- **B6** Handling ambiguous queries
