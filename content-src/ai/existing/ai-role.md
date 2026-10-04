---
id: ai-role
chapter: ai-patterns
title: What "AI engineer" means
minutes: 4
---
The term crystallised around 2023–2025 as a role distinct from "ML engineer." The clearest framing is Chip Huyen's (author of *AI Engineering*, O'Reilly 2025): **ML engineering starts with the model; AI engineering starts with the product.**

Traditional ML engineering is a slow, model-specific loop — collect and label data, train, evaluate, deploy — with the engineer deep in model internals. AI engineering starts from a product idea and uses an existing foundation model via API from day one, only reaching for data collection or custom training much later, if ever.

The practical consequences for your day-to-day:

- You do not need an ML degree or a labelled dataset to start. The barrier to *entry* is low; the barrier to doing it *well* is high, and the hard part is evaluation, not calling an API.
- Your core skills are prompting, retrieval, tool and agent design, evaluation, and inference cost/latency — not training loops or feature engineering.
- Fine-tuning is a last resort. Many teams never do it.

An interview implication worth internalising: expect **system-design-style** questions ("design an eval suite for X", "design a RAG pipeline for Y", "cut cost/latency for Z") far more than LeetCode. The rest of this course is built around those.
