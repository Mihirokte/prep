---
id: ai-observability
chapter: ai-production
title: Observability and tracing for LLM apps
minutes: 8
---
An LLM app needs trace-level visibility that traditional application monitoring does not give you. Latency and error rate alone cannot tell you why an agent gave a wrong answer, because the answer is the product of a prompt, retrieved context, several tool calls, and a model's reasoning, and any of them can be the fault. Observability for LLM systems means capturing that whole chain per request so you can decompose a vague bug report into a specific stage. Interviewers probe this because an engineer who cannot trace a bad answer back to its stage cannot debug a production LLM system at all.

## Traces and spans

The data model is borrowed from distributed tracing and it fits LLM apps well.

- A **trace** is one end-to-end request: the user's question through to the final answer.
- A **span** is one step inside that trace: an LLM call, a retrieval, a tool call, a guardrail check. Spans nest, so an agent loop is a trace with a span per step and sub-spans for each tool call inside a step.

```flow
dir: TB
trace: Trace, one request | step
embed: Span, embed query | model
ret: Span, retrieve | store
llm: Span, LLM call | model
tool: Span, tool call | tool
out: Span, output guard | gate
trace -> embed : start
embed -> ret : vector
ret -> llm : chunks
llm -> tool : tool request
tool -> llm : result
llm -> out : draft answer
out -> trace : final answer
```

Each span records its inputs, its outputs, its latency, and its token and cost figures, so the trace is a complete, replayable account of what happened.

## What to log

Log enough to reconstruct and replay a request without guessing.

```steps
Prompt | The full prompt and system message actually sent, after templating
Context | The retrieved chunks with their ids and scores
Tool calls | Each tool name, its arguments, and the result returned
Output | The raw model output before and after any post-processing
Usage | Input and output tokens, cost, latency per span and per trace
Metadata | Model and prompt version, user or session id, feedback signal
```

The non-obvious ones are the versions and the retrieved chunks. Without the prompt and model version on every trace you cannot tell whether a quality dip followed a deploy. Without the retrieved chunks you cannot tell a retrieval failure from a generation failure, which is the single most common RAG debugging question.

## Decomposing a wrong answer

This is the payoff and the interview framing. When a user reports the agent gave a wrong answer, the trace sorts it into one of three buckets with different owners and different fixes.

| Category | What the trace shows | Fix lives in |
|---|---|---|
| Retrieval | the right chunk is absent from the context span | chunking, hybrid search, reranking, k |
| Generation | the right chunk is present but the answer ignores or distorts it | prompt, model, citation requirement |
| Tool use | a tool span returned bad data or was called with wrong arguments | tool schema, description, validation |

> **Interview.** The user says it is wrong. You do not say the model hallucinated. You say pull the trace, check whether the answer chunk is in the retrieval span, and that tells you whether this is a retrieval bug or a generation bug, which have opposite fixes.

## Cost and latency dashboards

The same spans that debug correctness also drive cost and latency control. Aggregate token and cost per span to find the expensive step, and per-stage latency to find the slow one. A trace that shows retrieval at 40 milliseconds and the LLM call at 3 seconds tells you where to spend optimisation effort. Watch cost per request and per user as a first-class metric, because a prompt change that quietly doubles context length doubles cost silently unless the dashboard surfaces it.

## PII and privacy

Full-prompt logging collides with privacy. Traces contain exactly the sensitive data users send, so treat the trace store as production-sensitive: redact or hash PII before it lands, set retention limits, and gate access. The tension is real, because the richest trace is also the one that most endangers user data, so log what you need to debug and no more, and prefer references over raw sensitive text where a reference suffices.

## Feedback into evals

Observability closes the loop with evaluation. User signals captured on a trace, a thumbs-down, an edit, a re-ask, mark that trace as a probable failure, and those traces are the richest source of new regression cases. The pipeline is: trace captures the failure, a human confirms it, the case joins the offline eval set, and the next change is gated against it. This is how a production system's own failures become its permanent test suite.

```recall
Q: Why is latency-and-error-rate monitoring not enough for an LLM app?
A: A wrong answer is produced by prompt, context, tool calls, and reasoning together, and none of those shows up as an error or a latency spike. You need the full per-request trace to tell which stage was at fault.
Q: What two logged fields most often decide a RAG debugging question, and why?
A: The retrieved chunks and the prompt and model version. The chunks separate a retrieval failure from a generation failure, and the version tells you whether a quality dip followed a specific deploy.
Q: A user reports a wrong answer. What is the first thing the trace tells you?
A: Whether the answer chunk is present in the retrieval span. If it is absent the bug is retrieval; if it is present but ignored the bug is generation. These have opposite fixes.
Q: Why is the richest trace also a privacy liability?
A: It captures the full prompt and context, which contains exactly the sensitive data the user sent. So the trace store must be treated as production-sensitive with redaction, retention limits, and access control.
Q: How does observability feed back into evals?
A: Traces flagged by user signals like thumbs-down or edits are confirmed by a human and harvested into the offline eval set, turning production failures into permanent regression cases.
```

===DEEPER===

### Spans as the unit of attribution

The reason the span model is worth adopting rather than ad-hoc logging is attribution. A flat log line per request cannot answer which of three LLM calls in an agent loop was slow or expensive, because the costs are summed and lost. Spans keep each call's cost, latency, and tokens separate and nested under the trace, so you can roll up by span type, retrieval total vs LLM total vs tool total, and attribute a regression to one of them. For an agent that loops, this is the difference between the agent got slow and the second tool call started timing out on turn four, which is actionable. OpenTelemetry-style semantic conventions for LLM spans exist and are converging (as of 2026, re-check), so instrumenting with them keeps you portable across backends.

### The tooling category

This category is genuinely new relative to classic application performance monitoring, and it moves fast, so treat any who is best ranking as opinion. Independent comparisons repeatedly cite LangSmith (coupled to LangChain and LangGraph), Arize Phoenix (framework-agnostic, open-source), Langfuse and Comet Opik (open-source, self-hostable), Braintrust (evaluation-first), and Datadog (if you want LLM traces correlated with existing infrastructure metrics). The selection logic that survives the churn: do you need it self-hostable for data residency, is it tied to your framework or neutral, and does it unify tracing with evaluation so the feedback-into-evals loop is one system rather than two. Pick on those axes, not on a leaderboard (as of 2026, re-check the specific tools).

### Sampling at scale

Logging every full prompt and context for every request is expensive in both storage and privacy exposure once traffic is large. The usual compromise is to log all metadata, token, cost, latency, versions, for every request cheaply, and to retain full prompt-and-context payloads only for a sample plus every request a user flagged or that failed a guardrail. That keeps the aggregate dashboards complete while bounding the sensitive, bulky payload storage to the traces you are most likely to actually inspect. Set the sample rate from your debugging needs and your privacy budget, and always force-capture the failures, because a failure you did not record in full is a regression case you cannot build.

### Replay as the goal

The test of good instrumentation is whether you can replay a request from its trace: re-run the exact prompt against the recorded context and reproduce the output. If the trace captures the templated prompt, the retrieved chunks, the model and parameters, and the tool results, you can. Replayability is what turns a vague user complaint into a deterministic debugging session and what lets you verify a fix against the exact input that broke, so design logging backward from the question can I replay this.
