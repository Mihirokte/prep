---
id: ai-routing-batching
chapter: ai-production
title: Routing, cascades, and batching
minutes: 7
---
Routing, cascades, and batching are the cost levers you reach for after caching. The core idea: not every request needs a frontier model, and not every request needs to be answered now. Interviewers like these because they force you to reason about cost per request against accuracy and latency, and to say how you would measure that the cheap path is not quietly degrading quality.

## Routing

A router classifies each request and sends it to the cheapest model that can handle it: easy requests to a small fast model, hard ones to a frontier model. This is one of the five named workflow patterns in Anthropic, Building effective agents (2024). The classifier can be a small model call, a heuristic on request features, or embeddings plus nearest-neighbour against labelled examples.

```flow
dir: LR
req: Request | actor
router: Router | gate
small: Small model | model
big: Frontier model | model
req -> router : classify
router -> small : easy
router -> big : hard
small -> req : answer
big -> req : answer
```

The thing that gets tested is evaluation: you must track accuracy split by route and periodically sample the easy bucket for misroutes that actually needed the frontier model. A router that is 2 percent too aggressive can wipe out its own savings in retries and bad answers.

## Cascades

A cascade is a router without an upfront classifier. Try the cheap model first, then escalate only if a confidence or verification check fails. The check can be a self-reported confidence, a validator, a schema check, or a judge.

```steps
Try cheap | Send the request to the small model first
Check | Verify the output with a validator, schema, or confidence score
Escalate | On failure, retry on the frontier model
Return | Return the first answer that passes the check
```

The economics only work when the cheap model succeeds often and the check is cheap and reliable. If the small model fails half the time, you pay for two calls on half your traffic and may be slower than going straight to the frontier model. The verification step is the whole game: a weak check lets bad cheap answers through, an expensive check eats the savings.

## Batching

Batch APIs accept asynchronous, latency-tolerant request batches at a reduced per-token price. OpenAI's Batch API runs within a 24-hour window at a 50 percent cost discount versus the synchronous API (OpenAI docs, as of 2026, re-check). Use it for non-interactive workloads: bulk classification, offline eval runs, dataset generation, backfills.

```bars
title: Batch vs synchronous input cost (OpenAI, illustrative ratio)
unit: x
Synchronous | 1
Batch API | 0.5
```

Batching is orthogonal to caching. Caching helps repeated-prefix interactive traffic; batching helps one-shot bulk volume where latency does not matter. Reach for batching when a human is not waiting.

## Semantic cache

A semantic cache answers a new request from a stored response when the new query is similar enough to a past one, measured by embedding similarity. It can cut cost and latency hard on repetitive traffic.

> **Pitfall.** A semantic cache keys on similarity, not identity, so two prompts that are close in embedding space but need different answers can collide. A high threshold protects correctness but lowers hit rate; a low threshold raises hit rate but serves wrong answers. Tune it against a labelled set and never cache anything personalized or permission-sensitive.

## Trade-offs

| Lever | When it pays | Main risk |
|---|---|---|
| Routing | Mixed easy/hard traffic | Misroutes degrade quality silently |
| Cascade | Cheap model often enough | Double cost when it fails |
| Batching | Latency-tolerant bulk jobs | Up to 24h turnaround |
| Semantic cache | Repetitive queries | Similar query, wrong answer |

## Distillation

Distillation sits further downstream: train a smaller model to imitate a larger one on your task distribution, once you have production data and stable evals. It is not a first move. Reach for it only after prompting, routing, and caching, when you have the data and the eval bar to prove the small model holds up.

> **Interview.** Order the levers: caching first (free, no quality risk), then routing and cascades (cheap-path with a measured guardrail), batching for bulk, semantic cache with a tuned threshold, distillation last. Always pair a cheap path with the metric that proves it is not degrading quality.

```recall
Q: What is the key difference between a router and a cascade?
A: A router classifies upfront and picks a model before calling anything. A cascade tries the cheap model first and escalates only when a verification check fails, so it may pay for two calls on the same request.
Q: Why can a semantic cache serve a wrong answer?
A: It keys on embedding similarity, not exact match, so two close-but-different queries can collide and return a cached response that does not actually fit the new request.
Q: When is batching the right lever instead of caching?
A: When the work is one-shot bulk with no repeated prefix and no human waiting. Caching needs a reused identical prefix; batching trades latency (up to 24h) for roughly half price.
Q: How do you evaluate a router so savings do not hide quality loss?
A: Track accuracy split by route and periodically sample the easy bucket for misroutes that actually needed the frontier model, so you catch a router that is routing too aggressively.
```

===DEEPER===

## The routing accuracy math

Suppose 70 percent of traffic is genuinely easy and your router sends 75 percent to the small model, meaning 5 percent of total traffic is misrouted hard requests. If a misrouted request produces a wrong answer that triggers a retry on the frontier model, each misroute costs you a wasted small call plus a full frontier call, worse than if you had never routed it. The savings come from the correctly-routed 70 percent paying small-model prices. The decision hinges on the ratio of small-to-frontier price and the misroute rate: savings roughly equal (easy fraction) x (1 - small/frontier price ratio) minus (misroute rate) x (retry overhead). This is why the metric that matters is misroute rate, not raw cost reduction.

## Building the classifier

Three classifier styles, cheapest first. A heuristic on features (length, presence of code, detected intent) is free and transparent but brittle. An embedding plus nearest-neighbour against a labelled example set is cheap, fast, and improves as you add examples, but needs a maintained label set. A small-model classification call is the most flexible and the most expensive of the three; it is still far cheaper than the frontier model it gates. Start with embeddings-plus-kNN when you have labelled examples, because it is both cheap and improvable.

## Confidence signals for cascades

The cascade check needs a signal that correlates with correctness. Options: a schema or validator pass/fail (strong when the task has a verifiable structure), a self-consistency vote across a few cheap samples (escalate on disagreement), a judge model scoring the cheap answer, or token-level logprobs as a rough confidence proxy. Logprob confidence is weak and poorly calibrated on its own; prefer a verifiable check where the task allows one. Whatever the signal, calibrate the escalation threshold on a labelled set and track the escalation rate as an operational metric, because a drifting input distribution will quietly change how often you escalate and therefore your real cost.

## Composing the levers

In production these stack. A typical shape: a semantic cache in front catches repeats, a router splits the misses, both model paths use prompt caching for their stable system prompt, and anything that can tolerate delay goes to a batch queue instead. Each layer has its own metric: cache hit rate, misroute rate, escalation rate, batch turnaround. Treat them as a cost pipeline, measure each stage, and remember that routing can lower cache hit rate by fanning traffic across models, so the levers are not fully independent.
