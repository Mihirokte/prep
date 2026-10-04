---
id: ai-case-support-bot
chapter: ai-design
title: Design a support assistant
minutes: 9
---
A customer-support assistant is the most common AI design question because it touches everything: retrieval, generation, guardrails, human handoff, evals, and cost, all under a real quality bar where a wrong answer has consequences. The interviewer wants to see you clarify requirements first, then walk the request path end to end, then name the failure modes and how you would measure them. This lesson is a worked architecture, not a checklist to recite.

## Clarify first

Before any design, pin down the shape of the problem.

- Scope: deflect common questions, or also take actions (refunds, order changes)?
- Knowledge: how large is the help content, how often does it change, is any of it per-user?
- Stakes: what is the cost of a confidently wrong answer, and what must never be automated?
- Volume and latency: how many conversations, and what response-time expectation?
- Handoff: is there a human support team to escalate to, and how?

The answers decide almost everything downstream. A read-only FAQ deflector and an agent that can issue refunds are different systems with different risk.

## Architecture

```flow
dir: LR
user: Customer | actor
guard: Input guard | gate
retr: Retrieve docs | store
llm: Generate answer | model
cite: Check citations | gate
human: Human agent | actor
user -> guard : question
guard -> retr : query
retr -> llm : top-k chunks
llm -> cite : draft plus sources
cite -> user : grounded answer
cite --> human : low confidence
guard --> human : out of scope
```

The spine is RAG: retrieve relevant help content, generate an answer grounded in it, and cite sources. Two gates bracket the model: an input guard screens scope and safety, and a citation check gates the output. Both can route to a human.

## The request path

```steps
Ingest | Chunk and embed help docs offline, re-index on content change
Guard input | Screen for abuse, out-of-scope, and account-specific requests
Retrieve | Hybrid search plus rerank over the help index, scoped by product
Generate | Answer only from retrieved context, with inline citations
Verify | Check the answer is grounded in sources and confident enough
Handoff | Escalate low-confidence, action-requiring, or angry conversations to a human
```

The non-negotiable rule: the model answers from retrieved context and cites it, so a reviewer can trace every claim. If retrieval returns nothing relevant, the bot says it does not know and offers a human, rather than inventing an answer.

## Guardrails and handoff

| Risk | Guardrail |
|---|---|
| Abuse, prompt injection | Input classifier, isolate user text from instructions |
| Hallucinated answer | Require citations, verify grounding, refuse if unsupported |
| Out-of-scope or sensitive | Route to human, do not answer |
| Taking a risky action | Human approval before any state change |

Handoff is a feature, not a failure. The strong design escalates on low retrieval confidence, on any request that would change account state, and on detected frustration, carrying the conversation context to the human so the customer does not repeat themselves.

> **Pitfall.** A support bot that always produces an answer is worse than one that sometimes says I do not know and hands off. Confident wrong answers in support erode trust and create liability.

## Evals

Build the eval set from real tickets before launch and keep it fresh from production.

- Retrieval: recall@k on a labelled set of question-to-correct-doc pairs. Measure this first; generation cannot fix missing context.
- Generation: faithfulness (is every claim supported by sources), answer relevance, and citation correctness.
- End to end: resolution rate, escalation rate, and a sampled human review of a slice of live conversations.

Gate releases on these in CI so a prompt or index change cannot silently regress quality.

## Cost and latency

Cost per conversation is dominated by retrieved-context tokens and output length; cache the stable system prompt and tool schemas, and keep retrieved context tight. Latency is TTFT plus retrieval plus generation; stream the answer so the customer sees it immediately. For a high-volume deflection bot, route simple FAQ hits to a small model and reserve a frontier model for complex multi-part questions.

> **Interview.** Lead with clarifying questions (actions or read-only, stakes, handoff), draw the RAG spine with input and output gates, make grounded-with-citations the hard rule, treat handoff as a designed path, and name the metric per stage: recall@k for retrieval, faithfulness for generation, resolution and escalation end to end.

```recall
Q: Why is handoff a core feature of a support assistant rather than an edge case?
A: Confident wrong answers in support erode trust and create liability. Escalating low-confidence, action-requiring, and frustrated conversations to a human, with context carried over, is safer than always answering.
Q: What is the non-negotiable generation rule and why?
A: The model answers only from retrieved context and cites sources, so every claim is traceable. If retrieval finds nothing relevant, it says it does not know rather than inventing an answer.
Q: Why measure retrieval recall@k before generation metrics?
A: Generation cannot recover context that retrieval failed to surface. If the right document is not in the top-k, no amount of prompt tuning fixes the answer, so retrieval quality is the first gate.
Q: How does letting the bot take actions change the design?
A: Any state-changing action (refund, order change) needs a human-approval gate and tighter guardrails, because the cost of an error jumps from a wrong answer to a wrong transaction. A read-only deflector does not carry that risk.
Q: Where does cost per conversation mostly go, and how do you cut it?
A: Mostly retrieved-context tokens and output length. Cache the stable system prompt and tool schemas, keep retrieved context tight, and route simple FAQ questions to a small model while reserving the frontier model for hard ones.
```

===DEEPER===

## Ingestion and freshness

Help content changes, so ingestion is a pipeline, not a one-time load. Chunk documents structurally (by section, preserving headings as metadata), embed with the same model used for queries, and index with metadata for product, locale, and version so retrieval can filter. When a doc changes, re-embed and re-index just that document; a full re-index on every edit is wasteful and slow. Stale content is a silent failure: the bot confidently cites a policy that changed last week. Track content age and surface it, and consider a freshness signal in retrieval so newer authoritative docs win ties.

## The confidence signal for handoff

The escalation decision needs a usable confidence signal, and there are several, best combined. Retrieval score: if the top chunks are far from the query in embedding space, context is weak. Grounding check: run a lightweight judge or a self-consistency check asking whether the drafted answer is fully supported by the cited sources, and escalate if not. Intent and sentiment: a classifier on the user turn catches explicit requests for a human and detected frustration. Action detection: any request that maps to a state-changing tool routes to approval. Calibrate the thresholds against a labelled set of should-have-escalated conversations, and watch the escalation rate as an operating metric, because approval fatigue cuts both ways: too much escalation overwhelms the human team, too little lets bad answers through.

## Measuring resolution honestly

Resolution rate is the headline business metric but is easy to game. A conversation that ends is not necessarily resolved; the customer may have given up. Pair automated resolution (the conversation closed without escalation) with a sampled human review and, where possible, a follow-up signal (did the customer re-open a ticket on the same issue within a few days). Slice every metric by topic and by product, because an aggregate resolution rate can hide a category where the bot is systematically wrong. Feed reviewed failures back into the eval set so the golden set tracks real production weaknesses rather than the questions you imagined at launch. The RAG, guardrails, and evals lessons go deeper on each stage; this case is about wiring them into one system under a real quality bar.
