---
id: ai-prompt-versioning
chapter: ai-production
title: Shipping prompt changes safely
minutes: 3
---
Teams that ship prompt changes weekly need to know a change actually improved outcomes before rolling it out fully. The pattern combines the two eval modes from earlier:

1. **Offline eval-set regression test as a cheap pre-filter.** Run the new prompt against your golden and regression sets first to catch obvious regressions *before* spending any live traffic.
2. **Online A/B test as the real gate.** Offline sets can't capture the full production input distribution, so the actual rollout decision is gated on a live metric — pick one that reflects real value (task success rate, edit rate, thumbs-down rate), not just a proxy.

This echoes Huyen's "no single solution to evaluation" point: the offline set is necessary but not sufficient, and the online signal is where you make the call. Treat prompts like code — version them, test them, and gate their release.
