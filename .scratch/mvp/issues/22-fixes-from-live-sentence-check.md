# 22: Fixes from the live check of the answer sentence

**What to build:** On the live site with the real model (Gemma 4 12B, 20 Nov 2026), 15 of 16 model sentences passed the number guard. Three answers passed and are still wrong or cut off. The guard checks numbers, not meaning. Make these answers right, not only number-safe.

**Blocked by:** 12
_12 Answer sentence with number guard_

**Status:** ready-for-agent

- [ ] "Which region has the slowest delivery time?" was interpreted as average delivery time, sort `asc`, limit 1. The answer was "US-W has the slowest delivery time at 3.3 days", but US-W is the fastest region. Correct answer: US-C, 4.56 days (n=71). The interpret prompt spells out direction words for delivery time: slowest, longest and worst mean the most days (`desc`); fastest and quickest mean the fewest (`asc`). The phrase prompt never uses a direction word that contradicts the sort.
- [ ] "What share of orders were promo orders?" was interpreted as an order count with promo = yes, and the sentence said "The share of orders that were promo orders is 22". Correct answer: 22 of 400 orders, 5.5%. No metric expresses a share of orders. Either such a question gets `unsupported` with an honest reason, or the share is computed with `ratio()` as the filtered count ÷ all orders in the same period. Pick one and record it in ADR 0006. Either way, a sentence never calls a count a share, rate or percentage.
- [ ] "What was the on-time delivery rate per month?" made the model list all 12 months. The reply hit the 160-token limit and stopped after "Nov 2025" with no full stop, and the guard kept it. A reply cut off by the limit (`finish_reason` "length"), or one that doesn't end in sentence punctuation, falls back to the template. For a time series, the phrase prompt asks for the overall figure plus the highest and lowest buckets and any small samples, not every bucket.
- [ ] Tests for each case with a fake model. The three questions go into `eval/questions.json` with their expected specs, reworded so they don't copy the prompt's own examples.
- [ ] Optional polish seen in the same check: the facts block carries display labels, so the model copies "FedEx" (not "fedex", taken from the user's typo) and "In transit" (not "in_transit").
