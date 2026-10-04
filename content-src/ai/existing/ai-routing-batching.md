---
id: ai-routing-batching
chapter: ai-production
title: Cost and latency: routing and batching
minutes: 3
---
Two more proven cost levers beyond caching:

- **Model routing.** Anthropic's own named "Routing" workflow pattern: classify each request as easy or hard and send easy ones to a small, cheap, fast model and hard ones to a frontier model. The classifier can be a small model call, a heuristic, or embeddings + nearest-neighbour to labelled examples. Evaluate the routing itself by tracking accuracy split *by route* and periodically sampling "easy" misroutes that actually needed the frontier model. This is also the core pitch of LLM gateways (see the stack chapter).

- **Batching.** Batch APIs accept asynchronous, latency-tolerant request batches at a reduced per-token cost, for non-interactive workloads — bulk classification, offline eval runs, dataset generation. (The mechanism is well-known; confirm current discount rates before quoting.)

- **Distillation** sits further downstream — train a smaller model to imitate a larger one on your specific task distribution, once you have production data and stable evals. Not something to reach for before you have solid evals and a stable task definition.
