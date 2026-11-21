# 36: A Docker image (B4), built and smoke-tested in CI

**What to build:** A Dockerfile, so the app runs without installing Node. CI builds the image and checks it starts. B4 is the one bonus item still open. ADR 0008 §6 deferred it "only once every R1–R15 item and the deployed checks pass", and they now do.

This PC can't run Docker (Docker Desktop belongs to another Windows account), so CI is where the image is proven.

**Blocked by:** 35
_35 Import data (admin): check a CSV, then view the whole app on it, for this session only_

**Status:** ready-for-agent

- [ ] **`Dockerfile`, multi-stage.**
  - **Base:** `node:22-bookworm-slim`, pinned to an exact version tag.
  - **Build stage:** `npm ci`, then `npm run build`.
  - **Runtime stage:** the production dependencies, `.next`, `public`, `data/` and the fonts; runs `npm start` as the non-root `node` user on port 3000.
  - **Unchanged:** don't change `next.config` output mode; the server deploy keeps working exactly as it does.
  - **`HEALTHCHECK`:** `/api/health`.
- [ ] **`.dockerignore`:** `.git`, `node_modules`, `.next`, every `.env*`, `docs/brief`, `docs/private`, `.scratch` and `.sandcastle`.
- [ ] **Configuration** comes only from the environment at run time: the LLM gateway URL and key, `AUTH_SECRET`, and `AUTH_USERS_FILE` with the users file mounted read-only. No secret is baked into the image.
- [ ] **CI job `docker`** in `.github/workflows/ci.yml`, next to the check job:
  - build the image;
  - run it with a throwaway `AUTH_SECRET` and no LLM;
  - check that `/api/health` returns `"rows":400`, and that `/` redirects to `/login`.
- [ ] **README.**
  - "Run with Docker" with the two commands, the environment variables, and the note that Ask needs an OpenAI-compatible gateway.
  - Remove "Docker is not included" and the Future improvements line.
  - ADR 0008 §6 gets a dated note.
- [ ] **Checks.** `npm run check` passes; the CI `docker` job is green on the push.

## Comments
