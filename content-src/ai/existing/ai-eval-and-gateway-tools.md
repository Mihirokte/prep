---
id: ai-eval-and-gateway-tools
chapter: ai-stack
title: Eval tools and gateways
minutes: 4
---
**Eval tools** are a genuinely fragmented category, and that fragmentation is the honest state. Names: RAGAS (RAG-specific metrics), DeepEval (broader open-source), LangSmith (coupled to LangChain), Braintrust (evaluation-first commercial), Arize Phoenix (open-source, framework-agnostic), Langfuse (open-source, self-hostable), OpenAI Evals (first-party). The useful answer isn't the list — it's the **taxonomy**: open-source vs. commercial, trajectory-level (did the agent take a good path) vs. final-output-only, offline experiment-running vs. online monitoring, and framework-coupled vs. framework-agnostic. That mental model is sound regardless of which blog you read.

**LLM gateways / routers** give you one endpoint routing to many providers, with failover, caching, and centralised cost tracking — useful the moment you call more than one provider or want to swap providers without rewriting call sites. **LiteLLM** (open-source, self-hosted, no per-token markup) is the most consistently recommended for teams willing to operate it; **OpenRouter** (managed, zero-setup); **Portkey** (managed, enterprise governance). A directional (secondary-sourced) trend worth naming: gateways are evolving from "a 2024 convenience" toward "the control point of the AI stack" — cost governance, guardrails, and compliance sitting at the gateway layer rather than scattered through application code.
