# 36: A Docker image (B4), built and smoke-tested in CI

**What to build:** A Dockerfile, so the app runs without installing Node. CI builds the image and checks it starts. B4 is the one bonus item still open. ADR 0008 §6 deferred it "only once every R1–R15 item and the deployed checks pass", and they now do.

This PC can't run Docker (Docker Desktop belongs to another Windows account), so CI is where the image is proven.

**Blocked by:** 35
_35 Import data (admin): check a CSV, then view the whole app on it, for this session only_

**Status:** done

- [x] **`Dockerfile`, multi-stage.**
  - **Base:** `node:22-bookworm-slim`, pinned to an exact version tag.
  - **Build stage:** `npm ci`, then `npm run build`.
  - **Runtime stage:** the production dependencies, `.next`, `public`, `data/` and the fonts; runs `npm start` as the non-root `node` user on port 3000.
  - **Unchanged:** don't change `next.config` output mode; the server deploy keeps working exactly as it does.
  - **`HEALTHCHECK`:** `/api/health`.
- [x] **`.dockerignore`:** `.git`, `node_modules`, `.next`, every `.env*`, `docs/brief`, `docs/private`, `.scratch` and `.sandcastle`.
- [x] **Configuration** comes only from the environment at run time: the LLM gateway URL and key, `AUTH_SECRET`, and `AUTH_USERS_FILE` with the users file mounted read-only. No secret is baked into the image.
- [x] **CI job `docker`** in `.github/workflows/ci.yml`, next to the check job:
  - build the image;
  - run it with a throwaway `AUTH_SECRET` and no LLM;
  - check that `/api/health` returns `"rows":400`, and that `/` redirects to `/login`.
- [x] **README.**
  - "Run with Docker" with the two commands, the environment variables, and the note that Ask needs an OpenAI-compatible gateway.
  - Remove "Docker is not included" and the Future improvements line.
  - ADR 0008 §6 gets a dated note.
- [x] **Checks.** `npm run check` passes; the CI `docker` job is green on the push.
  - 2026-11-22: green. d8a2a78 was pushed together with 5b00090, so CI #31 ran on 5b00090 with the `docker` job included, and passed; CI #32 (3cdf5fb) passed too.

## Comments

- 2026-11-22: Done, committed and not pushed. The last box waits for the first CI run: this PC can't run Docker, so the image has never been built here.
  - **Base:** `node:22.23.5-bookworm-slim`, the newest Node 22 release on Docker Hub (11 Nov 2026), the same digest as `22-bookworm-slim` that day, checked with the Hub's tag API. One `ARG` names it for both stages.
  - **Build stage:** `npm ci`, then `npm run build`, which is when `next/font` fetches Figtree from Google Fonts. `.next/cache` is removed after it.
  - **Runtime stage:** `npm ci --omit=dev`, then `next.config.ts`, `.next`, `data/` and `assets/fonts`.
    - **What the server reads from disk** (grepped in `src/` for `readFileSync`, `statSync` and `process.cwd()`): the dataset (`domain/orders.ts`), the two Figtree files (`app/api/reports/report-pdf.ts`), and the secret, users and LLM key files the environment names.
    - **pdfkit,** kept out of the bundle by `serverExternalPackages`, comes from the production `node_modules` through the link the build leaves in `.next/node_modules`. Both stages use `/app`, so the link still resolves.
    - **`next.config.ts`** is loaded with Next's own SWC, so the image needs neither `typescript` nor `tsconfig.json`.
    - **There is no `public/` folder;** a test asks for one to be copied if it is added.
  - **Decisions the ticket left open:**
    - The image runs `next start` with node directly (`node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000`), as the server's service does, rather than through `npm start`. It is the same command, but `docker stop`'s SIGTERM reaches Next itself.
    - Everything in `/app` is root's. The `node` user may write only `.next/cache`, as LocalService may on the server.
    - The `HEALTHCHECK` uses node's `fetch` (slim has no curl): every 30 s, after a 30 s start period.
    - The LLM key comes only from `LLM_API_KEY_FILE`, a mounted file. The app has no `LLM_API_KEY` variable.
    - The README publishes the port on 127.0.0.1 only and keeps the users file outside the repo (`$HOME/logistics-users.json`); `users.json` is in `.gitignore` and `.dockerignore` in case one is left in the repo. It also says the session cookie is `Secure` (localhost or HTTPS), that the per-IP limits read Cloudflare's header, and that on Linux the mounted files must be readable by uid 1000.
    - `.dockerignore` also keeps out `.claude`, `*.tsbuildinfo` and `next-env.d.ts`.
  - **The CI `docker` job** sits beside `check` and is independent of it:
    - it builds the image;
    - it makes a users file with one analyst through `npm run users`, the password piped in, then makes the file readable by uid 1000;
    - it starts the container with a secret from `openssl rand -base64 32`, the users file mounted read-only, and no LLM, then waits for Docker to report it healthy;
    - it checks `"rows":400`, the redirect from `/` to `/login`, the sign-in form, a sign-in as the analyst, and the Nov 2025 report PDF;
    - on failure it prints the health checks and `docker logs`.
    The sign-in and the PDF go beyond the ticket's two checks. They prove the mounted files, pdfkit and the fonts in the image.
  - **Tests:**
    - `tests/docker.test.ts` pins what can be read without Docker: one exact Node 22 tag for both stages, the `node` user and the health check, the runtime stage's copies, no `AUTH_` or `LLM_` variable in the Dockerfile, and the `.dockerignore` list.
    - `tests/readme.test.ts` expects a "Run with Docker" section, and no longer expects Docker under Future improvements.
  - `npm run check`: 1255 tests. The runtime stage was simulated without Docker in a scratch folder holding only its files: the package files, `next.config.ts`, `data/`, `assets/fonts`, and `.next` without its cache, with pdfkit's link pointed at the folder's own install. It got `npm ci --omit=dev`, so no `typescript` and no `tsx`, and ran under `next start` on port 4810 with a throwaway secret and users file and the LLM pointed at a dead address:
    - **The CI job's own check step** passed, run with `bash -e`: `{"rows":400,"anchor":"2025-12-31"}`, `/` → 307 `/login`, the sign-in form, a sign-in, and the Nov PDF (27,616 bytes, Figtree Regular and Bold embedded).
    - **As an analyst,** the Overview (Total orders 400, "Data as of 31 Dec 2025") and every other page answered 200, and both CSVs downloaded. A viewer got 403 on the PDF.
    - **The health check's command** exits 0 on the live port, and 1 on a dead one or a non-2xx answer.
    - **The server wrote nothing** in its folder.
    It ran on this PC's Node 24, while the image runs 22. The workflow parses as YAML, and each step passes `bash -n`.
- 2026-11-22: the CI `docker` job is green: CI #31 (head 5b00090, which carries d8a2a78) and CI #32 (3cdf5fb) both passed, checked by Kedar in GitHub Actions. Checks box ticked.
