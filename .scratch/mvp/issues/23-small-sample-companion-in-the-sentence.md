# 23: The small-sample companion's value and direction in the sentence

**What to build:** When the top group is a small sample, a model sentence must give the n ≥ 20 group's value and the right direction, not only its name. Found on the live site with the real model after ticket 22 (20 Nov 2026). Everything else in that check was right.

**Blocked by:** 22
_22 Fixes from the live check of the answer sentence_

**Status:** ready-for-agent

- [ ] "Which carrier is the least reliable?" (on-time rate by carrier, ascending, limit 1). The model wrote: "GLS is the least reliable with 62.5% (5 of 8), which is a small sample. USPS is the top among groups with at least 20 delivered orders." The guard kept it because USPS is named. But the sentence drops USPS's value (74.5%, 35 of 47) and calls the lowest group "top". When the facts carry the n ≥ 20 companion, a model sentence must contain the companion's value exactly as formatted. It must not use "top" or "highest" for an ascending ranking, or "bottom" or "lowest" for a descending one. Otherwise the template stands; it already reads "among carriers with at least 20, USPS 74.5% (35 of 47)".
- [ ] Optional: when many points of a series tie at an extreme, the sentence names at most three and counts the rest. Seen live: "the lowest weeks were w/c 29 Sep, w/c 20 Oct, w/c 27 Oct, w/c 10 Nov, w/c 24 Nov, w/c 22 Dec and w/c 29 Dec with 0". A reader is better served by "no delayed orders in 7 of the 14 weeks".
- [ ] Tests with a fake model replaying both live sentences.

Already fixed outside this ticket: the assumption note for an ascending "best" ranking now reads "The worst is read as the lowest on-time delivery rate." It used to say "Best" was the highest even for "least reliable".
