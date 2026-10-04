---
id: ai-fine-tune-vs-prompt
chapter: ai-production
title: Fine-tune vs. prompt: a decision order
minutes: 4
---
Chip Huyen's guidance is unambiguous: fine-tuning is *"often a last resort and many teams never do it."* Two reasons: the complexity of hosting and maintaining a fine-tuned model, and the fact that rapid base-model improvement erodes a fine-tuned model's advantage — you can end up locked to a checkpoint that's worse than the next base release.

OpenAI's stated order of operations reinforces it: **get evaluations in place first**, and only invest in fine-tuning once you can measure whether it actually helps. You cannot rationally decide to fine-tune without the eval infrastructure already built.

The decision order that follows:

1. **Prompting** — with good structured outputs and few-shot examples. Exhaust this first.
2. **RAG / retrieval** — when the model needs facts it doesn't have, especially private, large, or changing data.
3. **Fine-tuning** — only when prompting plus retrieval demonstrably can't reach the needed behaviour, format, or latency; you have evals to prove it; and you've accepted the cost of owning a model artifact you'll re-train as base models improve.

Where fine-tuning *does* start to make sense: high volume, a fixed taxonomy, and latency/cost sensitivity (e.g. classifying 500K tickets/month into 40 categories) — but even then the memo should first prove prompting-only can't hit the bar.
