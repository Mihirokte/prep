---
id: ai-model-choice
chapter: ai-foundations
title: Choosing and sizing a model
minutes: 8
---
Model choice is an engineering decision with three competing axes: quality, latency, and price. There is no best model, only the smallest, cheapest model that passes your eval on your task. Interviewers ask this to see whether you reach for a leaderboard (weak) or for an eval-driven, cost-aware decision with fallbacks (strong).

## Capability tiers

Think in tiers, not product names, because names and prices change constantly.

- Small fast models: cheapest and lowest latency, good for classification, extraction, routing, simple rewriting, and high-volume calls.
- Mid-tier general models: the workhorse for most RAG and chat.
- Frontier models: strongest reasoning and instruction-following, highest price and latency, use where quality clearly pays.
- Reasoning models: trained to produce a hidden chain of thought before answering, strong on hard multi-step problems, but they emit extra thinking tokens you pay for and wait on.

> **Rule of thumb.** Start with the smallest tier that could plausibly work, measure, and move up only when the eval demands it. Over-provisioning model capability is the most common and most expensive default.

## Reasoning models and thinking-token cost

A reasoning model spends tokens thinking before it answers. Those tokens cost money and add latency even though you may never see them. That is worth it on genuinely hard reasoning (multi-step math, complex planning) and wasteful on simple tasks, where a small model is both cheaper and faster. Also note that an explicit chain-of-thought instruction on top of a model that already reasons by default can be redundant or even hurt, research has found CoT lowering accuracy on some task types (Liu et al., Chain-of-Thought can reduce performance, arXiv 2410.21333). Match the model class to the problem.

## The latency, price, quality triangle

```flow
dir: TB
task: Task + eval | gate
q: Quality | step
l: Latency | step
p: Price | step
task -> q : must pass eval
task -> l : budget per call
task -> p : budget per 1k calls
```

You rarely get all three. A frontier model maximises quality but costs more and is slower; a small model wins latency and price but may fail the eval. The job is to find the point on the triangle your product actually needs, not the globally strongest model.

```bars
title: Rough trade-off across tiers (illustrative, relative)
unit: relative
Small model latency | 1
Mid model latency | 3
Frontier model latency | 8
Small model price | 1
Frontier model price | 20
```

These are illustrative ratios to show the shape, not quoted prices. The gap between tiers is often an order of magnitude on both price and latency.

## Eval-driven selection

Pick the model with your eval, not a leaderboard. The process:

```steps
Define the task | Write 20 to 100 representative inputs with known-good outputs or a grading rubric
Set the bar | Decide the minimum quality score and the latency and cost budgets the product needs
Run candidates | Score each model tier on the same eval, record quality, p50/p95 latency, cost per call
Pick the smallest pass | Choose the cheapest, fastest model that clears the quality bar
Re-check on drift | Re-run when you change the prompt, the data, or the model version
```

> **Interview.** Asked how to choose a model, do not name one. Say: define the task and an eval, set quality, latency, and cost budgets, score tiers on that eval, pick the smallest model that passes, and wire a fallback. That answer survives any model release.

## Context size, open versus closed weights

Context window size is a real selection axis: an agent accumulating history or a RAG system stuffing many chunks needs headroom, but a bigger window is a ceiling, not free capacity (you still pay per token and accuracy can drop on very long inputs). Open-weight models let you self-host (control, data residency, no per-token API fee, but you own the GPUs and ops) versus closed API models (no infra, latest capability, but per-token cost, rate limits, and vendor dependence). Choose by data-sensitivity, scale, and whether you have serving expertise.

## Fallbacks and why leaderboards mislead

Production needs a fallback: when the primary model is rate-limited, slow, or down, route to an alternative (a second provider, or a smaller model for a degraded-but-live answer). An LLM gateway makes this a config change rather than code.

Leaderboards mislead for concrete reasons: they average over tasks that are not yours; benchmarks leak into training data (contamination), inflating scores; a single aggregate score hides the slice you care about; and they ignore latency and cost entirely. Use them to shortlist candidates, then decide with your own eval.

```recall
Q: Why is "which model is best" the wrong question?
A: Best is task-, latency-, and cost-dependent. The right question is the smallest, cheapest model that passes your eval on your task, with a fallback.
Q: When does a reasoning model earn its extra cost, and when does it not?
A: It earns it on hard multi-step problems where the hidden thinking improves the answer. On simple tasks the extra thinking tokens add cost and latency for no gain, and an added CoT instruction can even hurt.
Q: Name two reasons a leaderboard can mislead model selection.
A: It averages over tasks unlike yours and can be contaminated by benchmark data leaking into training; it also ignores latency and cost and hides per-slice performance.
Q: Why wire a fallback model, and what does a gateway contribute?
A: To stay available when the primary is rate-limited, slow, or down. A gateway makes routing and fallback a config change with shared logging and budgets, not bespoke code.
```

===DEEPER===

### A cost model for the choice

Per-request cost is roughly input_tokens * price_in + output_tokens * price_out, and reasoning models add a thinking-token term to the output side that you pay for even when it is hidden. At scale multiply by request volume: a model that is 10x cheaper per call but needs a reranker or a retry still often wins on total cost of ownership. Put real volume into the arithmetic before deciding, a 2x price difference is irrelevant at 100 calls a day and decisive at 10 million.

### Routing and cascades

You do not have to pick one model for everything. A router classifies each request and sends easy ones to a small model and hard ones to a frontier model, cutting average cost while keeping quality where it matters. A cascade tries the cheap model first and escalates only when a confidence check or a validator fails. Both need a cheap, reliable signal to decide, which is itself an eval problem. The routing-and-cascades lesson covers the mechanics and the semantic-cache risks.

### Validating with your own data, concretely

Build a golden set from real or realistic inputs, 50 to a few hundred cases is often enough to separate tiers. Grade with exact match or field comparison for structured tasks, and with an LLM-as-judge against a rubric for open-ended ones (watch the judge's biases, see that lesson). Record quality, p50 and p95 latency, and cost per call per model. Re-run the suite in CI so a prompt or model-version change cannot silently regress quality. The eval lessons in the production chapter make this a repeatable gate rather than a one-off spreadsheet.
