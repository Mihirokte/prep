---
id: ai-eval-and-gateway-tools
chapter: ai-stack
title: Eval tools and gateways
minutes: 7
---
Two stack categories, evaluation tooling and LLM gateways, are where interviewers test whether you can describe a fragmented market by its structure rather than by reciting whichever products a blog ranked this month. The useful knowledge is the taxonomy and what each layer buys you, because the specific product names churn and the capabilities overlap. Verify current names and features against primary docs, this lesson gives you the map, not a frozen ranking.

## Eval tools: a fragmented category, honestly

The eval-tool space is genuinely fragmented, and saying so is the honest state. Names you will hear: RAGAS (RAG-specific metrics), DeepEval (broad open-source), LangSmith (coupled to LangChain), Braintrust (evaluation-first commercial), Arize Phoenix (open-source, framework-agnostic), Langfuse (open-source, self-hostable), OpenAI Evals (first-party). The list is not the answer, the taxonomy is.

| Axis | One end | Other end |
|---|---|---|
| Licence | Open-source, self-host | Commercial, hosted |
| Granularity | Trajectory, did the agent take a good path | Final output only |
| Mode | Offline, run experiments | Online, monitor production |
| Coupling | Framework-coupled | Framework-agnostic |

That mental model is sound regardless of which post you read, and it is what lets you place a new tool the moment you hear its pitch.

## Gateways: one endpoint in front of many providers

An LLM gateway (or router) is a proxy that sits between your application and the model providers, exposing one endpoint that routes to many models. It becomes worth adding the moment you call more than one provider or want to swap providers without rewriting call sites.

```flow
dir: LR
app: Application | actor
gw: LLM gateway | gate
pa: Provider A | model
pb: Provider B | model
cache: Cache | store
log: Cost and logs | store
app -> gw : one endpoint
gw -> pa : route or fallback
gw --> pb : fallback
gw -> cache : read and write
gw -> log : usage
```

What a gateway buys you: routing (pick a model per request), fallback (retry another provider when one fails or is down), caching (reuse repeated calls), budgets (per-key and per-tenant spend limits), and centralised logs (one place for cost and latency across providers). The named options recur consistently: LiteLLM (open-source, self-hosted, no per-token markup) for teams willing to operate it, OpenRouter (managed, zero-setup, many models), Portkey (managed, enterprise governance). All fast-moving, verify current capabilities.

> **Key idea.** A gateway turns provider choice into a config decision instead of a code change, which is what makes model routing, fallback, and cost governance possible without touching call sites.

## The trend worth naming

A directional, secondary-sourced trend: gateways are evolving from a 2024 convenience toward the control point of the AI stack. Cost governance, guardrails, and compliance increasingly sit at the gateway layer rather than scattered through application code, because the gateway is the one place every model call already passes through. Multiple 2026 references frame it this way (secondary, convergent, re-verify), and the architectural logic is sound, a single choke point is the natural home for cross-cutting policy.

```recall
Q: Why describe eval tools by a taxonomy instead of a ranked list?
A: The market is fragmented and the products churn, so a ranking goes stale and carries vendor bias. The axes, open vs commercial, trajectory vs output, offline vs online, coupled vs agnostic, let you place any tool from its pitch and stay current.
Q: At what point does an LLM gateway start to pay for itself?
A: As soon as you call more than one provider or want to swap providers without rewriting call sites. It centralises routing, fallback, caching, budgets, and logs that would otherwise be scattered per call site.
Q: What specifically does fallback in a gateway protect against?
A: A provider outage, rate limit, or error on one model, the gateway retries the request against another provider or model so a single provider failure does not take down your feature.
Q: What does it mean to call the gateway the control point of the stack?
A: Every model call passes through it, so it is the natural place to enforce cross-cutting policy, cost budgets, guardrails, and compliance, rather than duplicating that logic across application code.
Q: Why distinguish trajectory-level from final-output eval for agents?
A: An agent can reach a correct answer through a wrong or wasteful path, or a right path that happened to fail. Trajectory eval judges the steps taken, output eval judges only the end result, and agents need both.
```

===DEEPER===

### Why the eval market is so fragmented

Evaluation spans jobs that are genuinely different, so no single tool dominates. RAG evaluation needs retrieval metrics (recall at k, mean reciprocal rank) and generation metrics (faithfulness, answer relevance), which is why RAG-specific tools exist. Agent evaluation needs trajectory analysis, did the agent pick good tools in a sensible order, which is a different data shape entirely. Production monitoring needs online capture of real traffic with feedback loops, while development needs offline experiment-running against fixed datasets. A tool optimised for one of these is awkward at another, so teams often run two, one for offline experiments and one for online monitoring, and the taxonomy axes are really a map of which job each tool was built for.

### What a gateway does not solve

A gateway centralises calls, but it does not make a bad model choice good, nor does it fix a prompt or a retrieval defect, it operates below the quality layer. It also adds a hop, so it introduces its own latency (small, often single-digit milliseconds for a thin proxy, but non-zero) and its own failure mode, if the gateway is down, everything behind it is unreachable, which is why self-hosted gateways need the same reliability engineering as any critical infrastructure. And a semantic cache in a gateway, returning a stored answer for a similar-enough query, carries a real correctness risk: two questions that embed close together can have different correct answers, so semantic caching trades accuracy for cost and must be scoped carefully. The gateway is plumbing, powerful plumbing, but not a substitute for the quality work upstream of it.

### How the two categories connect

Eval tools and gateways meet in production. The gateway is where every call is logged, so it is the natural source of the traffic that feeds online evaluation and the dataset you build offline evals from, real production inputs are the best eval data. Several tools blur the line deliberately, offering both tracing or gateway features and evaluation in one product, which is convenient but re-raises the coupling question, a combined tool that is excellent at gateway duties may be mediocre at eval, or lock you into one vendor for both. The principle-first answer is to keep the layers conceptually separate, know what routing, logging, and evaluation each require, so you can judge whether a bundled product actually serves all of them or just one well.

### Keeping the answer current

Every product name here is a moving target, licences change, companies get acquired, capabilities expand, so the durable skill is the structure, not the roster. In an interview, lead with the taxonomy and the capability list (routing, fallback, caching, budgets, logs for gateways, the four axes for eval), name a representative example or two with the caveat that the space moves fast, and say you would verify current features against primary docs before committing. That demonstrates exactly the signal-from-hype judgment the question is testing, which outlasts any specific tool.
