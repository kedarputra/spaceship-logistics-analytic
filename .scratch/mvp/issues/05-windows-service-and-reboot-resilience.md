# 05: Windows service on portable Node, and reboot resilience

**What to build:** The app runs on the home server as the Windows service `spaceship`, reachable at `https://wms.nalabs.ai`, and comes back after a reboot or power cut without anyone logging in (ADR 0010). One admin session on the server, ending with one reboot test. Not done by Sandcastle; operator-only details go in the private runbook.

**Blocked by:** 01
_01 App skeleton, data loading and health check_

**Status:** ready-for-human

- [ ] Pinned portable Node 24 from the official zip, SHA-256 checked, in the location ADR 0010 names, with read and execute for LocalService.
- [ ] An install script and a WinSW service template are committed, with no secrets and no operator-only detail.
- [ ] Service `spaceship` configured as ADR 0010 §3 describes: LocalService, delayed automatic start, below-normal priority, restart at 10 s / 30 s / 2 min, logs rolled at 10 MB, `node` called directly on `127.0.0.1:4800`, the three `LLM_*` variables set.
- [ ] Access grants as in ADR 0010 §3, and `sc sdset` gives the server account start and stop rights on this one service.
- [ ] Until ticket 06 exists, the service runs one release built by hand behind the `current` junction.
- [ ] Auto-logon for the server account with an immediate screen lock; BIOS set to power on after AC loss.
- [ ] Reboot test: after a restart and before any logon, `https://wms.nalabs.ai/api/health` answers `{"rows":400,...}`; after auto-logon, the gateway is up too.
- [ ] The public reboot sequence in `docs/runbook.md` matches what happened; anything operator-only goes in the private runbook.
