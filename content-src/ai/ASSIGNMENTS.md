# Writer assignments

Read `/Users/mihirokte/projects/prep/content-src/ai/SPEC.md` first. Output goes to `/Users/mihirokte/projects/prep/content-src/ai/lessons/<id>.md`. For lessons marked (existing), read `/Users/mihirokte/projects/prep/content-src/ai/existing/<id>.md` first and expand it: keep what is correct, deepen it, add diagrams. Where a drill is named, the drill is a practice problem on this topic (`id | title`); the lesson must give the reader what they need to answer it, but do not restate the drill. Practice drills live in `/Users/mihirokte/projects/prep/seed/content.json` (area key `ai`) if you want to read the prompt and solution.

Lessons reference each other only by plain words, never by link.

## W1: foundations and first building blocks (9 lessons)

| id | chapter | title | cover |
|---|---|---|---|
| ai-tokens | ai-foundations | Tokens, context windows, and cost | BPE idea, tokens vs words, context window = input + output, prefill vs decode, why cost and latency scale with tokens, code and non-English token inflation, worked cost arithmetic (illustrative prices), `stack` diagram of a window |
| ai-sampling | ai-foundations | Sampling and determinism | logits -> softmax -> sample, temperature, top-p, top-k, why temperature 0 is not guaranteed deterministic, seeds, which setting for extraction vs brainstorming, `bars` showing how temperature reshapes a distribution |
| ai-attention-kv | ai-foundations | Attention and the KV cache | self-attention intuition without heavy math, quadratic prefill cost, KV cache size formula with a worked example, why decode is memory-bandwidth bound, GQA/MQA in one paragraph, link to why long context and prompt caching behave as they do |
| ai-embeddings | ai-foundations | Embeddings and similarity | what an embedding is, cosine vs dot vs L2, dimensions and Matryoshka truncation, bi-encoder vs cross-encoder, must re-embed everything when the model changes, domain mismatch, ANN (HNSW/IVF) in one paragraph each |
| ai-model-choice | ai-foundations | Choosing and sizing a model | capability tiers, reasoning models and thinking-token cost, open vs closed weights, context size, the latency / price / quality triangle, eval-driven selection, fallbacks, why leaderboards mislead |
| ai-role (existing) | ai-patterns | What an AI engineer does | the job vs ML engineer / data scientist, the skill stack, the eval-first build loop, what interviewers probe |
| ai-prompting | ai-patterns | Prompts that hold up | prompt anatomy, few-shot, chain-of-thought and when it helps or hurts (reasoning models), delimiters, negative instructions, system prompt altitude (drill ai-019: Write a system prompt at the right altitude), prompts as versioned code |
| ai-structured-outputs (existing) | ai-patterns | Structured outputs | JSON mode vs schema-constrained decoding vs tool-call-as-schema, validate and repair loop, failure modes (truncation, enum drift, refusals), schema design tips, worked extraction pipeline (drill ai-020: Structured outputs: schema-first extraction pipeline) |
| ai-tool-calling | ai-patterns | Tool calling | the protocol (model emits a call, app runs it, result goes back), tool schema and description design, parallel calls, errors as observations, idempotency and permissions, `mermaid` sequence of one round trip |

## W2: retrieval and the stack (9 lessons)

| id | chapter | title | cover |
|---|---|---|---|
| ai-rag (existing) | ai-patterns | RAG: grounding a model in your data | offline vs online path, failure taxonomy (retrieval vs generation), citations, worked example with numbers, measure recall@k first |
| ai-chunking | ai-patterns | Chunking and indexing | fixed, recursive, structural, semantic chunking, size and overlap trade-off, metadata, small-to-big (parent-child), contextual retrieval chunk augmentation (drill ai-022: Contextual retrieval: implement chunk-context augmentation), tables and code, re-indexing |
| ai-hybrid-search (existing) | ai-patterns | Hybrid search and reranking | BM25 vs dense and how each fails, reciprocal rank fusion with a worked numeric example, cross-encoder reranking, latency budget, from-scratch sketch (drill ai-003: Implement hybrid search with reranking from scratch) |
| ai-query-transform | ai-patterns | Query rewriting and routing | condensing chat history into a query, multi-query, HyDE, step-back, decomposition for multi-hop, routing to indexes, when transformation hurts |
| ai-rag-vs-long-context (existing) | ai-patterns | RAG vs long context | decision table, cost math, needle tests vs real reasoning, lost-in-the-middle, permissions and freshness, retrieve-then-stuff (drills ai-002: RAG vs. long context for legal Q&A; ai-025: Why a huge context window doesn't make RAG obsolete) |
| ai-frameworks (existing) | ai-stack | Frameworks: the honest take | raw SDK vs LangChain / LangGraph / LlamaIndex / DSPy / Pydantic AI; abstraction leaks; decision rule (drill ai-016: Should this team use LangChain?) |
| ai-vector-dbs (existing) | ai-stack | Vector databases | pgvector vs dedicated vs managed, HNSW/IVF/PQ trade-offs, filtered search, scale numbers, ops cost, decision for a 2M-document system (drill ai-015) |
| ai-eval-and-gateway-tools (existing) | ai-stack | Eval tools and gateways | landscape of eval and tracing tools and LLM gateways (verify current names and capabilities on primary sources), what a gateway buys you (routing, fallback, caching, budgets, logs) |
| ai-stack-judgment (existing) | ai-stack | What to say about the stack | principle-first answers, swap-ability, build vs buy, a minimal stack, a decision checklist |

## W3: agents and context (9 lessons)

| id | chapter | title | cover |
|---|---|---|---|
| ai-agents-vs-workflows (existing) | ai-agents | Agents vs workflows | the definition split, a concrete example of each, when the loop earns its cost (drill ai-017) |
| ai-workflow-patterns | ai-agents | The five workflow patterns | prompt chaining, routing, parallelization (sectioning and voting), orchestrator-workers, evaluator-optimizer; a `flow` diagram for EACH pattern; source: Anthropic, Building effective agents |
| ai-agent-loop (existing) | ai-agents | The agent loop | loop anatomy, stop conditions, step and cost budgets, tool set design (drill ai-005: Design a tool set for a coding agent), `flow` with a back edge |
| ai-memory | ai-agents | Agent memory | working context vs long-term store, scratchpad and notes, summarisation and compaction, retrieval-based memory, episodic vs semantic, write policies and staleness (drill ai-018: Design a memory strategy for a multi-day agent task) |
| ai-single-vs-multi-agent (existing) | ai-agents | Single vs multi-agent | when multiple agents help (parallel breadth, context isolation) and when they just multiply cost and coordination bugs; verify claims from Anthropic's multi-agent research system write-up (drill ai-006) |
| ai-hitl (existing) | ai-agents | Human-in-the-loop checkpoints | risk tiers, approval policy, interrupt and resume with durable state, approval fatigue (drill ai-007) |
| ai-mcp (existing) | ai-agents | Model Context Protocol | host, client, server; tools, resources, prompts; stdio vs streamable HTTP; auth; security risks; when the protocol pays for itself (drills ai-008, ai-023); verify against modelcontextprotocol.io |
| ai-context-engineering (existing) | ai-agents | Context engineering | context rot, what belongs in the window, just-in-time retrieval, compaction, note-taking, sub-agents for isolation (drills ai-004, ai-009); source: Anthropic, Effective context engineering for AI agents |
| ai-case-coding-agent | ai-design | Design: a coding agent | requirements, tools and sandbox, the loop, context management, evals (SWE-bench-style and your own), safety and approvals, cost; `flow` architecture + failure modes |

## W4: evals, observability, safety (8 lessons)

| id | chapter | title | cover |
|---|---|---|---|
| ai-evals (existing) | ai-production | Evals | why evals come first, unit-style vs end-to-end, offline vs online, regression gating in CI (drill ai-001: Design an eval suite for a RAG chatbot) |
| ai-eval-datasets | ai-production | Building eval datasets | sources (production logs, synthetic, expert-written), sizes and confidence, slicing, contamination and leakage, maintaining a golden set |
| ai-rag-eval | ai-production | Evaluating RAG | retrieval metrics (recall@k, MRR, nDCG) with a worked numeric example, generation metrics (faithfulness, answer relevance, context precision), component vs end-to-end |
| ai-llm-as-judge (existing) | ai-production | LLM as judge | pointwise vs pairwise, position / verbosity / self-preference bias, calibration against human labels (Cohen kappa), rubric design (drill ai-014: Debug a failing LLM-as-judge pipeline) |
| ai-observability (existing) | ai-production | Observability and tracing | traces and spans for LLM apps, what to log, PII, cost and latency dashboards, feedback into evals (drill ai-021) |
| ai-prompt-versioning (existing) | ai-production | Shipping prompt changes safely | prompts as artifacts, versioning, shadow and canary, A/B with eval gates (drill ai-024) |
| ai-guardrails (existing) | ai-production | Guardrails and safety | input, output, and action guardrails, rule vs classifier vs LLM checks, latency and false positives, sandboxing (drill ai-013: Design guardrails for an agent that can execute code) |
| ai-prompt-injection | ai-production | Prompt injection and agent security | direct vs indirect injection, the lethal trifecta (Simon Willison), confused deputy, defenses (least privilege, isolate untrusted content, human approval, dual-LLM / CaMeL idea), OWASP LLM Top 10; verify each named source |

## W5: cost, latency, training, serving, design cases (9 lessons)

| id | chapter | title | cover |
|---|---|---|---|
| ai-prompt-caching (existing) | ai-production | Prompt caching | prefix KV reuse, breakpoints, TTL, write premium vs read discount, ordering a prompt for cacheability, worked cost model (drill ai-010: Build a prompt-caching-aware cost model); verify against provider docs |
| ai-routing-batching (existing) | ai-production | Routing, cascades, batching | routers and cascades, batch APIs (async, discounted; verify), semantic cache and its risks (drill ai-011) |
| ai-latency | ai-production | Latency and streaming | TTFT vs per-token latency, streaming, a per-stage latency budget, parallel calls, smaller models, prefix caching, perceived-latency UX; `bars` of a latency budget |
| ai-fine-tune-vs-prompt (existing) | ai-production | Fine-tune or prompt | decision order (prompt -> retrieval -> fine-tune), when fine-tuning wins, data needs, cost (drill ai-012) |
| ai-finetuning-methods | ai-production | Fine-tuning methods | SFT, LoRA / QLoRA, preference optimisation (DPO, RLHF), distillation, data quality, catastrophic forgetting, evaluating a tuned model, serving adapters |
| ai-inference-serving | ai-production | Serving models | continuous batching, paged attention (vLLM), quantization, tensor parallelism, throughput vs latency, GPU memory arithmetic with weights + KV cache, when to self-host |
| ai-case-support-bot | ai-design | Design: a support assistant | requirements, ingestion, retrieval, generation, guardrails, human handoff, evals, cost estimate, failure modes; `flow` architecture |
| ai-case-doc-pipeline | ai-design | Design: document extraction at scale | batch vs online, structured outputs, validation and confidence, review queue for low confidence, evals, cost; `flow` architecture |
| ai-interview-framework | ai-design | A framework for AI design questions | clarify -> data -> model -> architecture -> eval -> cost and latency -> risks; a checklist for each step and a worked mini-example |
