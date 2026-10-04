---
id: ai-rag-vs-long-context
chapter: ai-patterns
title: RAG vs. long context
minutes: 5
---
One of the most actively contested, fastest-moving debates in the field — treat any specific number here as fast-moving and re-verify before quoting.

The tension: with million-token context windows, why retrieve at all — why not stuff everything in?

- A Jan 2025 arXiv study found long-context prompting often *outperforms* RAG on QA benchmarks, especially encyclopedic questions; RAG kept an edge on dialogue and general queries.
- **Cost is the counterweight.** One 2026 benchmark reported long context scoring higher on correctness at roughly *26x* the per-query token cost of RAG. (Secondary source — plausible given per-token pricing, not independently confirmed.)
- **Prompt caching changes the math**, making repeated long-context calls much cheaper on the repeated prefix — which undercuts the older "long context is always too expensive" framing.

A recurring practitioner metaphor: **RAG is the filing cabinet, long context is the bigger whiteboard.** Use RAG when data is large, frequently updated, or you need per-document citations and access control. Use long context for cross-document reasoning over a bounded, static corpus you can afford. Many systems do both — retrieve a broad candidate set, then reason over a larger-than-chunk window of it.

The strong interview answer is not "RAG is dead" or "RAG always wins." It is: name the cost/accuracy/freshness trade-off, and say what you'd actually benchmark on your own eval set before deciding.
