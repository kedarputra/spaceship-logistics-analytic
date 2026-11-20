# 07: UptimeRobot monitor

**What to build:** If the public app stops answering, a phone alert arrives within minutes (ADR 0010 §6).

**Blocked by:** 06
_06 Deploy watchdog with read-only deploy key_

**Status:** ready-for-human

- [ ] Confirmed at signup that the UptimeRobot free plan includes keyword checks (if not, pick an equivalent and note it in ADR 0010).
- [ ] Keyword monitor for `"rows":400` on `https://wms.nalabs.ai/api/health`, every 5 minutes; it does not call `?ai=1`.
- [ ] Alerts go to the UptimeRobot phone app and to email.
- [ ] Test: stopping the service briefly fires an alert that arrives on the phone and by email, and a recovery notice follows.
