---
id: ai-observability
chapter: ai-production
title: Observability and tracing
minutes: 4
---
LLM calls need trace-level visibility that traditional APM doesn't give you: not just latency and error rate, but the full prompt and context sent, the retrieved chunks, every tool call with its arguments and results, and token usage and cost per step.

Why it matters concretely — when a user reports "the agent gave a wrong answer," a trace lets you decompose that into distinct failure categories instead of treating the agent as a black box:

- **Retrieval problem** — the right context never came back.
- **Generation problem** — good context came back, the model reasoned over it badly.
- **Tool-use problem** — a tool returned bad data or was called wrong.

Those need completely different fixes, and you can't tell them apart without the trace.

The tooling category is genuinely new relative to APM. Leaders cited across independent comparisons (a fragmented, fast-moving space — treat any "who's best" ranking as opinion): **LangSmith** (coupled to LangChain/LangGraph), **Arize Phoenix** (framework-agnostic, open-source layer), **Langfuse** and **Comet Opik** (open-source, self-hostable), **Braintrust** (evaluation-first), and **Datadog** (if you want it correlated with existing infra).
