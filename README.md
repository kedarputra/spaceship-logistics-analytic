# Logistics Analytics Dashboard

An AI-powered analytics dashboard for a logistics client, built as Spaceship's AI Engineer technical assessment. It shows KPIs and charts over one CSV of 400 orders, answers questions asked in plain language, and forecasts demand. The model reads the question and words the answer; code computes every number.

- **Live app:** [wms.nalabs.ai](https://wms.nalabs.ai). Sign in with the test accounts in the submission email, one per role (see [Access and roles](#access-and-roles)).
- **Loom walkthrough:** _added at submission_

## Setup

You need Node 22 or later and npm.

```bash
npm ci
cp .env.example .env.local                 # set AUTH_SECRET and AUTH_USERS_FILE in it
npm run users -- add me admin --generate   # prints the password once
npm run dev                                # http://localhost:3000, sign in as "me"
```

Every page asks you to sign in (ADR 0012), so even a local run needs a session secret and an users file: the `AUTH_` variables below. The dashboard pages (Overview, Delivery, Carriers, Forecast and Raw data) need nothing else: they read `data/mock_logistics_data.csv` and compute in code. Only the ask box needs an LLM. Without one it says AI is not configured, and the rest of the app works.

Copy `.env.example` to `.env.local` and set these variables:

| Variable | Default | What it is |
|---|---|---|
| `AUTH_SECRET_FILE` | none | The path to a file that holds the key that signs sessions: 32 random bytes or more, base64. The server's way, like the LLM key file. |
| `AUTH_SECRET` | none | The key itself, for local runs and CI. Set this or `AUTH_SECRET_FILE`, never both. Without a usable key, nothing but `/login` opens, and it says sign-in isn't configured. |
| `AUTH_USERS_FILE` | none, required | The path to the users file, a JSON list of `{ username, role, passwordHash }` kept outside the repo. `npm run users` creates it. Without it, nobody can sign in. |
| `LLM_BASE_URL` | `http://127.0.0.1:4000/v1` | An OpenAI-compatible chat-completions endpoint. |
| `LLM_MODEL` | `chat` | The model name the endpoint expects. |
| `LLM_API_KEY_FILE` | none, required | The path to a file that holds the key, so the key itself is never in an environment variable or the repo. For an endpoint without keys, any non-empty text works. |
| `LLM_RESPONSE_MODE` | `json_schema` | `json_schema` has the endpoint enforce the reply's schema; `json_object` puts the schema in the prompt, for an endpoint that cannot. `npm run smoke:llm` tells you which yours supports. |
| `LLM_MODEL_DISPLAY_NAME` | `Gemma 4 12B` | The model as the page names it, since `LLM_MODEL` can be an alias. |

The app was tested only with Gemma 4 12B behind our gateway. Another OpenAI-compatible endpoint should work, but is untested.

| Command | What it does |
|---|---|
| `npm run check` | Typecheck, tests and production build, in that order. CI runs it on every push. Tests never call the LLM, so they need no keys. |
| `npm run build` then `npm start` | The production server. |
| `npm run smoke:llm` | One call to the configured endpoint: does it answer, and does it enforce `json_schema`? |
| `npm run eval` | Sends the questions in `eval/questions.json` through the model (see [AI approach](#ai-approach)). Needs the LLM. |
| `npm run users -- add <username> <role>` | Adds an account to the `AUTH_USERS_FILE` file (or `--file <path>`), asking for its password twice without echo; `--generate` makes one and prints it once instead. `list` shows the accounts and roles, never a hash; `remove <username>` deletes one. |

## Deployment

Self-hosted on our own server behind a Cloudflare Tunnel. Questions are answered by our own LLM on our own GPU, with no third-party AI provider, and the gateway stores no request bodies. Monitored with phone alerts.

Details in ADR 0010 (hosting), ADR 0009 (LLM) and ADR 0012 (sign-in).

| Setting | Value |
|---|---|
| Public URL | `https://wms.nalabs.ai` → Cloudflare Tunnel → `next start` on `127.0.0.1:4800` |
| Process | Windows service `spaceship` (WinSW, LocalService), starts at boot, restarts on crash |
| Deploys | A watchdog checks `main` every 2 minutes, builds each new commit in its own folder (`npm ci`, `npm run check`), switches over, and rolls back if `/api/health` fails |
| Environment variables | The ones under [Setup](#setup); the LLM key, the session secret and the accounts live in files outside the repo |
| Sign-in | A session cookie signed under the server's secret, for 8 hours; 5 tries a minute per IP and 10 wrong passwords an hour per username, then 429 |
| Rate limit, `/api/ask` | 20 requests per IP per minute, then 429 ("Too many questions in a minute, try again shortly"); the IP is Cloudflare's `CF-Connecting-IP` |
| Rate limit, `/api/*` | 120 requests per IP per minute, then 429 |
| Health check | `GET /api/health` returns `{"rows":400,"anchor":"2025-12-31"}`; `?ai=1` also checks the LLM with a 1-token call, at most once a minute, and answers 503 when it is down |
| Monitoring | UptimeRobot keyword check every 5 minutes with phone alerts; a daily GitHub Actions check (`.github/workflows/uptime.yml`, also runnable by hand) of the health, the AI, the dashboard's redirect to `/login`, and the sign-in form |

How the pieces start after a reboot, how to create the accounts, and the review-window checklist are in `docs/runbook.md`.

## Access and roles

Every page asks you to sign in. The test accounts, one per role, are in the submission email; this repository holds no password. What each role can do is one matrix in code (`can(role, action)` in `src/auth/roles.ts`), which pages, API routes and the menu all ask (ADR 0012):

| Action | Viewer | Analyst | Admin |
|---|---|---|---|
| Dashboards: Overview, Delivery, Carriers, Forecast, Raw data | yes | yes | yes |
| Ask the data: `/ask`, `/api/ask`, `/api/run` | no | yes | yes |
| Downloads: `/api/orders.csv` | no | yes | yes |
| Import data (planned) | no | no | yes |
| Users: the accounts and their roles, read-only, at `/users` | no | no | yes |

- **The menu** lists only the pages the role can open, and links to Ask or the CSV show only to roles that can use them.
- **A page the role can't open** shows "Your role, Viewer, can't open Ask the data.", with links to the Overview and to sign in as someone else. An API route answers 403.
- **A session** is an HttpOnly cookie signed with HMAC-SHA256, for 8 hours.
- **Every request** reads the account's role from the users file, so a removed account or a changed role applies at once.
- **Passwords** are scrypt hashes with a random salt.
- **Sign-in** says "Wrong username or password." whichever was wrong, and is limited per IP and per username.

## Architecture

One Next.js 16 app (App Router): its route handlers are the backend, and there is no separate service. React 19, TypeScript 7 in strict mode, Tailwind 4, Recharts 3 and Zod 4, tested with Vitest 5. There is no database and no SQL: the 400 orders are parsed from the CSV once per server instance, validated row by row, and kept in memory (ADR 0005). The LLM is called with plain `fetch`, without an SDK.

### Layers

| Folder | Holds | May import |
|---|---|---|
| `src/domain/` | The orders and their row schema, the KPI and metric definitions, period resolution, number formats | nothing else in `src/` |
| `src/tools/` | The query spec (the whitelist), the query tool, the forecast tool, chart choice, the template sentences, and the orders a Raw data view shows | `domain/` |
| `src/ai/` | The model client, prompts, interpretation, phrasing, the number guard, the question cache | `tools/` |
| `src/auth/` | Sign-in and roles: the roles matrix, the session cookie, password hashes, the users file and its CLI | nothing else in `src/` |
| `src/app/`, `src/components/` | Pages, route handlers, the proxy (rate limits and sessions), UI | everything above |

Dependencies point one way: `app/` and `components/` → `ai/` → `tools/` → `domain/`. `auth/` stands beside them: only `app/` and `components/` import it, so the data, the tools and the AI never know who is asking. The AI layer never reads the CSV or computes a figure; it only gets results from the tools. `tests/architecture.test.ts` scans every import and fails on any other edge, so the rule runs inside `npm test` (ADR 0004). This is how the brief's separation of AI interpretation, computation and business logic (R10) is enforced rather than just intended.

### Pages and endpoints

| Route | What it shows |
|---|---|
| `/` Overview | The five KPIs, orders and delivery outcomes per month, the delay rate by carrier, and the demand forecast, with links to the detail pages |
| `/ask` Ask the data | The ask box, the answer with its chart and explanation panel, suggested questions, and the recent questions of this browser |
| `/delivery` | Delivery outcomes and the on-time delivery rate per month, and the average delivery time by region and by warehouse |
| `/carriers` | All 9 carriers: the delay-rate chart, highlights, and a table with every metric |
| `/forecast` | A forecast for the total or one category, warehouse or region, 1, 3 or 6 months ahead; the method comparison, the plan's arithmetic, and all 22 scopes side by side |
| `/login` | Sign in: the product name, Username and Password. The only page that opens without a session |
| `/users` | For admins: the accounts and their roles, read-only |
| `/data` Raw data | The 400 orders as the file has them, read-only: filters by status, carrier, region, warehouse, category, promo, a month range by order or delivery date, and a search; a sort by any column, pages of 50, a summary of the rows shown, and a CSV download. Every view is a URL, such as `/data?status=delayed&carrier=FedEx` |

The dashboard pages call `domain/` and the tools directly, without the LLM, so they work when the AI is down. Raw data reads its filters with the query spec's schema and picks rows with the query tool's own matching, so it counts the same orders an answer with the same filters counts. A card, bar or table row that shows a count opens those orders in Raw data, and the view shows the same number; a rate with no orders of its own opens the page that breaks it down. An answer on the Ask page opens the orders it was computed over the same way, when every part of its spec is a Raw data filter. A count of 0 has no link. Pointing at a month on a month chart, or moving to it with the arrow keys, shows its values in a tooltip, and a click opens that month's orders. Cards and charts carry no explanatory subtext: a definition, a date basis or a note is in the info popover after the title, one hover, focus or tap away. The pages follow ADR 0011: a dark rail with the pages the role can open and, at its foot, who is signed in; three brand colours; and chart colours checked for colour-blind separation.

| Endpoint | Does |
|---|---|
| `POST /api/ask {question}` | The full flow below. Questions up to 300 characters. |
| `POST /api/run {spec}` | Runs a spec without the model, validated by the same schema. Follow-up chips and re-runs from the history use it. |
| `GET /api/health` | Row count and anchor date; with `?ai=1`, the LLM's state and the model name. Public, for the monitors. |
| `POST /api/login {username, password, next}` | Signs in: the session cookie, and where to go next (only a path on this site). Public. |
| `POST /api/logout` | Signs out: clears the cookie and returns to `/login`. Public. |
| `GET /api/orders.csv?…` | The orders of a Raw data view, with the page's own parameters, as CSV: the file's header and raw values, all pages, in the view's sort. |

### From question to chart

```
question ── POST /api/ask: rate limit, length limit
   │
   ├── question cache hit? ───────────────────────────────┐
   ▼                                                       │
interpret  (Gemma 4 12B, temperature 0, one JSON reply      │
            in the schema derived from tools/spec)          │
   │  Zod validates it against the whitelist; one retry     │
   │  with the errors; after that an honest "could not"     │
   ▼                                                       │
interpretation ◄────────────────────────────────────────────┘
   │  tool = query | forecast | unsupported
   ├── query        status rewrite → period resolved against the anchor date → query tool
   ├── forecast     forecast tool: method chosen per series, inventory plan
   └── unsupported  the reason, and 3 example questions from a fixed list
   ▼
result  (code: values, n, small-sample flags, resolved dates, a template sentence)
   ▼
phrase  (the model words 1–2 sentences from a facts block, temperature 0.2)
   │  number guard and wording checks; on any failure, the template fallback
   ▼
answer: sentence + chart chosen by code + explanation panel
```

Every answer shows, under its sentence, a row of chips naming the metric, the dimension, the filters and the resolved period with its date field (R5). Below it, "How this was computed" is closed until opened: the interpretation in words, written by code from the spec; the resolved period with its dates and date field; the filters with their resolved values; the metric's definition; any rewrite; the validated spec as JSON; the result table; and, for counts, the matching orders. It also has a pipeline trace of the stages above, with their timings, and one sentence on why the chart has its type.

While the model works, which can take 10 to 18 seconds on a busy GPU, the answer card shows the question, pulsing dots, "Thinking…" with the seconds so far, and a skeleton of the answer; the rail's AI dot pulses too. The reply is not streamed, so the page claims no stage it cannot see.

### Key design decisions

| Decision | ADR |
|---|---|
| A delivered order is any order with a delivery date; on-time delivery rate = `status = delivered` ÷ delivered orders; groups under 20 deliveries are flagged | 0001 |
| Relative periods are resolved in code against an anchor date taken from the data, never by the model | 0002 |
| Forecast monthly units; four simple methods compared per series on a 3-month holdout | 0003 |
| One Next.js app in layered folders, with the dependency rule tested | 0004 |
| Data in memory, validated on load; no database, so no generated SQL | 0005 |
| A whitelist of metrics with one breakdown at a time; charts chosen by code | 0006 |
| Bonus scope: history, cache, tests, ambiguity handling and a pipeline trace; Docker only if time is left | 0008 |
| Our own LLM behind our gateway; one structured output; sentences checked by code | 0009 |
| Self-hosted as a Windows service behind a Cloudflare Tunnel, deployed by a watchdog | 0010 (replaces 0007) |
| Six pages, a dark rail and three brand colours; Raw data filters with the query tool's own code | 0011 |
| Sign-in with three roles in one matrix; accounts in a file, sessions in a signed cookie | 0012 (replaces 0007 §3) |

### Bonus items

- **Query history (B1):** the last 20 questions in this browser's `localStorage`, re-run through `/api/run` without the model.
- **Caching (B2):** an in-memory cache of validated specs and checked sentences, keyed by the normalized question, the model and the prompt version. Results are always recomputed.
- **Tests (B3):** golden numbers from `docs/data.md`, the row schema's traps, period buckets, the status rewrites, city matching, the number guard, the forecast methods, and the architecture rule.
- **Advanced explainability (B5):** the pipeline trace and the "why this chart" sentence.
- **Ambiguous queries (B6):** documented defaults, stated in the answer, with the other readings as chips.
- **Docker (B4)** is not included (see [Future improvements](#future-improvements)).

## AI approach

The model has two jobs: it turns a question into a structured spec, and it words the opening sentence of the answer from facts that code computed. It never produces a number, and nothing it writes is executed.

**Interpretation.** One call at temperature 0 returns one JSON object, a union tagged by `tool`:

- `query`: a metric, at most one breakdown, filters, a symbolic period ("the previous month", "the last 3 months"), and an optional sort, limit and date field;
- `forecast`: a forecast scope (the total, a category, a warehouse or a region) or a SKU, and a horizon or target months;
- `unsupported`: a reason from a fixed list, and 3 example questions picked from a fixed list.

**How the tool is selected.** The model picks the tag. Its prompt holds the JSON schema, the allowed values of each dimension, one-line metric definitions, and worked examples that paraphrase the brief's questions rather than copy them, including unsupported ones. The schema is derived with `z.toJSONSchema` from the same Zod schema that validates the reply (`src/tools/spec.ts`), so what the model is asked for and what code accepts cannot drift apart. The gateway enforces the schema (`json_schema` mode), and Zod validates the reply anyway. Unknown metrics, dimensions or values are refused, never guessed; a near miss gets "did you mean". An invalid reply gets one retry with the validation errors; after that the user gets an honest "could not" with example questions.

**Computation.** Code takes over from the validated spec:

- An order count filtered by status is rewritten to its canonical metric ("orders with status delayed" → delayed orders), so the same question gets the same number however the model phrased the spec.
- The symbolic period is resolved against the anchor date. The model never sees the anchor date and never computes a date.
- The query tool or the forecast tool computes the result from the definitions module, the same one the dashboard uses. A ranking carries n per group and its small-sample case, decided in code.
- Code chooses the chart from the spec and the result's shape: time and a count → bars, time and a rate or average → a line, categories → horizontal bars, a share of a whole → a stacked bar. No pie charts, and the table is always there.

**Phrasing.** A second call at temperature 0.2 gets the question, the spec in words, the definition, and a facts block: every value, n, numerator and denominator, resolved period and threshold, formatted as the page shows them. The sentence is kept only if:

- every number in it appears in the facts exactly as written there (the number guard), with no number words such as "three" or "twice";
- it is complete, not cut off;
- it names every group the result requires: all tied leaders, and for a small-sample leader also the leader with at least 20 deliveries;
- it describes a ranking the right way round, and never calls a count a share or a rate.

Otherwise the template fallback opens the answer: the sentence code wrote from the same result. The trace says why. A question costs at most 3 model calls: interpret, one retry, phrase.

**Failure modes.** At most 2 model calls are in flight, each with a 15-second timeout. A busy gateway gives "busy, try again shortly"; a down one gives "AI unavailable right now".

Interpretation is measured with `npm run eval`: it sends the committed questions in `eval/questions.json` through the model and reports how many specs match, with each miss. It needs the LLM gateway, so it runs on the server and never in CI.

Last run on the server, 21 Nov 2026:
- **Result:** 36 of 36 specs match (100%), the same in two runs back to back. No misses. Six of the 36 are the questions the pages suggest as chips; a test keeps every suggested question in the set.
- **Model:** Gemma 4 12B (instruct, Q5_K_M) behind the gateway's `chat` alias, with structured output in `json_schema` mode.
- **How to read it:** the list is small. It grew from failures seen with the real model, reworded so it doesn't copy the prompt's own examples. Treat it as a regression check, not a benchmark.

## Supported questions

The ask box answers what the whitelist can express (ADR 0006):

- **Metrics:** order count, share of orders, delivered orders, on-time deliveries, delayed orders, exception orders, on-time delivery rate, delay rate, average delivery time, units, gross order value, net order value, and delivery outcomes (on time, delayed, exception) by week or month.
- **One breakdown:** by day, week or month; or by carrier, region, warehouse, origin, destination, category, status, client or promo.
- **Filters:** one or more values of any of those dimensions, or a SKU. Values match in any case, and cities also by name alone ("austin" → "Austin, TX").
- **Periods:** the previous or current week, month, quarter or year; the last N of them; the last N days; a named month or quarter; a date range; or the whole year of data.
- **Rankings:** highest or lowest, the top N (up to 20), and "among carriers with at least 20 deliveries".
- **Forecasts:** demand in units for the total, one category, one warehouse or one region, 1 to 6 months ahead (3 when the question doesn't say) or up to named months within that reach, with the units to plan for. A horizon in weeks becomes whole months, with a note. A question about one SKU gets that SKU's orders and its category's forecast.
- **Ambiguous words** get a documented default, stated in the answer, with the other readings as chips: "best" and "performance" mean the on-time delivery rate, and "late" means delayed.

The brief's example questions, and what they return:

| Question | Answer |
|---|---|
| How many orders were delivered late last month? | 3, in November 2025, by delivery date |
| Show delayed orders by week for the last 3 months | 10 delayed orders over 14 weeks (Oct–Dec 2025), as bars |
| Which carrier has the highest delay rate? | GLS at 25.0%, but on only 8 deliveries; among carriers with at least 20, USPS at 23.4% (11 of 47) |
| How much inventory should I plan? | 405 units over the next 3 months: 285 forecast plus safety stock |
| Predict demand for SKU CRAYON-0008 for the next 4 months | Its 3 orders, why a single SKU isn't forecast, and the CRAYON forecast |

**Out of scope.** A forecast for a single SKU is never made: each SKU has at most 3 orders, so the question gets the SKU's orders and its category's forecast instead. Each of these others gets a short reason and 3 supported example questions:

- two breakdowns at once ("delay rate by carrier and region");
- numeric filters ("orders with more than 5 units");
- a breakdown by SKU (there are 355);
- a forecast of a combination (crayons at one warehouse), or of order counts or order value;
- free-text follow-ups ("and for UPS?"): every question stands alone, and the chips under an answer are the follow-ups;
- questions that aren't about this data.

## Data definitions

One module, `src/domain/definitions.ts`, owns every KPI and metric definition. The dashboard and the answers both call it, so the same question always gets the same number (ADR 0001). The values below are for the whole dataset; tests assert them.

| KPI | Definition | Value |
|---|---|---|
| Total orders | Every row | 400 (27 in transit, 3 canceled) |
| Delivered orders | Orders with a `delivery_date`: status delivered, delayed or exception | 370 (304 on time · 55 delayed · 11 exception) |
| On-time delivery rate | `status = delivered` ÷ delivered orders | 82.2% · 304 / 370 |
| Delayed orders | `status = delayed`; "delivered late" means the same | 55 |
| Delay rate | Delayed orders ÷ delivered orders, per group | 14.9% · 55 / 370 |
| Average delivery time | Mean of `delivery_date − order_date` in days, over delivered orders | 3.8 days |

Rates are shown with their numerator and denominator, and days with one decimal. Computation keeps full precision.

**The anchor date.** The data ends on 31 Dec 2025, so "last month" against today's date would be empty. Relative periods count back from an anchor date, the latest order or delivery date in the data, computed when the data loads (ADR 0002). The page header shows it as "Data as of 31 Dec 2025".

- "Last month" is the full month before the anchor's month: 1–30 Nov 2025.
- "The last 3 months" are the 3 months ending with the anchor's month: 1 Oct–31 Dec 2025.
- "This month" is the anchor's month. A named month without a year is its latest occurrence ("March" is March 2025).
- Weeks are ISO weeks, Monday to Sunday, named by their Monday ("w/c 6 Oct"). Edge weeks are clipped to the period and marked, and empty buckets are 0.

**The date field.** Order counts, units and order value are dated by `order_date`. Delivery outcomes (delivered, on time, delayed, exception, their rates and the delivery time) are dated by `delivery_date`. A question that names the order date ("delayed orders placed last month") switches to it. The explanation always says which field was used.

## Assumptions and simplifications

- **On time comes from `status`.** The data has no promised date, so "on time" can only mean `status = delivered`.
- **An exception is not late.** Exception orders were delivered but are neither on time nor delayed. They have their own count, so the on-time delivery rate (82.2%) and the delay rate (14.9%) don't add up to 100%: the other 3.0% are exceptions.
- **`status` is trusted as given.** 26 of the 27 in-transit orders were placed before December, the oldest on 3 Jan 2025, but they are counted as open, not overdue.
- **Small samples are flagged.** A group with fewer than 20 delivered orders is a small sample. Rankings still rank it, mark it, and never name it the winner on its own.
- **`order_value_usd` is gross.** Net order value applies `promo_discount_pct`.
- **Forecasts are monthly units by order date,** for one scope at a time. The candidates are the all-history average, the 3-month moving average, linear regression and Holt's linear trend with fixed parameters. Each is scored on Oct–Dec 2025 after fitting on Jan–Sep. The lowest error wins, a tie goes to the simpler method, and the winner is refit on all 12 months (ADR 0003).
- **The plan is forecast demand plus safety stock,** rounded up: safety stock = 1.65 × σ × √months, a one-sided 95% service level, with σ from the chosen method's one-step-ahead errors from April 2025. For the total over 3 months: 285 + 119.05 = 404.05, so 405 units to plan for. The data has no stock on hand, so this is a plan, not a reorder quantity.
- **One server instance.** The cache, the rate limits and the sign-in limits are in memory, which is reliable only because there is one instance.

## Limitations and unsupported queries

- **Forecast error is large.** With 12 months of data, the winning method's holdout error (WAPE) runs from 9.4% (ATL-DC1) to 289.5% (LON-FC1 and UK); on the total it is 17.1%. 13 of the 22 scopes are labelled "rough" (error over 50%): 4 of the 8 categories, 6 of the 9 warehouses and 3 of the 5 regions. The labels are the honest result, not a bug.
- **No seasonality.** January 2025 is a spike (233 units against a Feb–Dec average of 98), and one year cannot show whether it repeats. Every forecast that includes January says how its method treats the spike.
- **The method choice rests on 3 months.** A 3-month holdout is a noisy basis for picking a method.
- **No per-SKU forecasts.** Each of the 355 SKUs has at most 3 orders.
- **Many groups are small.** No destination reaches 20 deliveries, and only 5 of the 30 clients do, so those rankings are flagged as unreliable rather than named.
- **The model can misread a question.** The explanation panel shows exactly how it was read, and the eval guards the readings we know about. A sentence that fails the number guard gives way to the plainer template fallback.
- **One server.** Availability depends on the server's power and internet line. Other workloads share the GPU, so the ask box can answer "busy, try again shortly". After a reboot, the dashboard comes back at once and the ask box when the gateway is up.
- **History stays in one browser,** and reviewers behind one office IP share the limit of 20 questions a minute, and of 5 sign-in tries a minute.
- **Sessions are not stored on the server.** Removing an account ends its sessions at once, but a changed password does not end the old ones before their 8 hours; changing the secret signs everyone out. Ten wrong passwords in an hour lock a username for the rest of that hour, so someone guessing can lock a shared test account.
- **Unsupported queries** are listed, with what each gets instead, under [Supported questions](#supported-questions).

## Future improvements

- **A database,** for data that grows or changes. The query tool would build parameterized queries from the same validated spec, so the model still never writes SQL.
- **Rolling-origin evaluation** to choose forecast methods on many holdouts instead of one, and seasonal methods once there are two years of data.
- **Follow-up questions** in free text: pass the previous spec with the new question, and validate the changed spec as before.
- **A Docker image** (B4), for running the app without installing Node.
- **A larger eval set,** including the phrase step: score the sentences, not only the specs.
- **Shared state** (a cache and rate limits in Redis, for example) if the app ever runs on more than one instance.

## AI usage

**At runtime** the app calls Gemma 4 12B-it (Q5_K_M) through our own LLM gateway, on our own GPU, with no third-party AI provider. The model does two things: it turns a question into a structured query spec at temperature 0, and it words the answer's opening sentence from computed facts at temperature 0.2. The spec is validated against a whitelist, code computes every number shown, and the number guard checks the sentence (ADR 0009).

**Building it.** This project was built with AI assistance, disclosed here as the brief asks. The code and documents were written with Claude Code (Claude Opus 5.5) in interactive sessions in VS Code, and every commit carries a `Co-Authored-By: Claude Opus 5.5` line.

- **Planning.** Claude helped restate the brief (`docs/requirements.md`), measure the dataset (`docs/data.md`) and list the open decisions. I settled those decisions one at a time in a question-and-answer session with Claude, which recorded them as ADRs 0001–0010 and wrote the tickets in `.scratch/mvp/issues/`.
- **Building.** Claude implemented each ticket test-first. Before it started, I agreed which seams to test and settled any open choice. Each ticket then passed `npm run check` and a review by two separate Claude subagents, one against the coding standards and one against the ticket, before it was committed. Most tickets that changed a page or the ask flow were also checked in the built app in a headless browser, with a local fake LLM in place of the real one. Findings from the live app became new tickets.
- **Design.** The redesign (ADR 0011) was drawn with Claude on a design canvas from three colours I chose, and exported to `docs/design/`.
- **Server.** Claude wrote the deploy scripts; I do the server setup by hand (ADR 0010 §10), and I run the eval there.
- **This README** was drafted by Claude from the ADRs and the code.

The repository also holds a Sandcastle setup (`.sandcastle/`) for running agents unattended in containers. It was set up, but not used to build the tickets.
