# 02: Gateway client `spaceship` and key file

**What to build:** The app gets its own credentials on our LLM gateway: a chat-only client and a key file that only the server account and LocalService can read (ADR 0009). Done in a local session on the server, not by Sandcastle; operator-only details go in the private runbook.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] Gateway client `spaceship` with `models: ["chat"]`, `rpm: 120`, `max_concurrency: 2`, and the gateway reloaded.
- [ ] The key file sits at the path in ADR 0009, readable only by the server account and LocalService.
- [ ] A request to the gateway's model list succeeds with the key and gets 401 without it.
- [ ] `.env.local` in the development checkout sets `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY_FILE`; `git status` shows it is ignored.
- [ ] The key itself appears nowhere in the repo, its history, or a chat transcript.

## Comments

- 2026-11-20: Gateway client spaceship (chat only, rpm 120, max_concurrency 2) added and the gateway restarted. Key file at the ADR 0009 path, readable only by the server account and LocalService. Verified: /v1/models 200 with the key, 401 without; a 1-token completion as spaceship returns OK. .env.local set and gitignored. Operator details in the private runbook.
