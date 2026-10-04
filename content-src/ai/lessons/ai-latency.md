---
id: ai-latency
chapter: ai-production
title: Latency and streaming
minutes: 8
---
Users do not experience average latency, they experience the first token and the pace after it. The two numbers that matter are time-to-first-token and per-token latency, and they come from different parts of the system, so they are tuned by different levers. Interviewers ask this to see whether you can build a per-stage latency budget and know which lever cuts which stage, rather than reaching for a smaller model for everything.

## TTFT versus per-token latency

Time-to-first-token (TTFT) is how long until the first output token appears. It is dominated by prefill: reading and encoding every input token before decode starts, plus any upstream work (retrieval, routing, network). Per-token latency, often reported as inter-token latency or its inverse tokens-per-second, is how fast tokens come after the first, and it is set by decode, which generates one token at a time and is memory-bandwidth bound.

```flow
dir: LR
user: User | actor
retr: Retrieval | store
prefill: Prefill | model
decode: Decode loop | model
user -> retr : query
retr -> prefill : context
prefill -> decode : first token
decode -> decode : next token
decode -> user : stream
```

Total latency is roughly: upstream work + prefill (scales with input length) + output length x per-token latency. Long input hurts TTFT; long output hurts total time through the per-token term.

## Streaming

Streaming sends tokens as they are generated instead of waiting for the full response. It does not reduce total time, but it collapses perceived latency: the user sees output at TTFT instead of at completion. For a 600-token answer at 40 tokens per second, non-streaming makes the user wait about 15 seconds for anything; streaming shows the first words in well under a second and then flows.

> **Key idea.** Streaming changes perceived latency, not total latency. The first token is the moment the user stops waiting.

## A per-stage latency budget

Set a target, then split it across stages and attack the fattest one.

```bars
title: Latency budget for one RAG answer (illustrative ms)
unit: ms
Embed query | 40
Vector search | 60
Rerank | 120
Prefill context | 300
First token to user | 180
```

Here prefill plus rerank dominate. The levers follow the budget: if prefill is fat, shorten or cache the context; if rerank is fat, rerank fewer candidates or use a lighter reranker; if decode is the problem, that shows up as a long tail on output length, not in TTFT.

## The levers, matched to the stage

| Lever | Cuts | Cost or limit |
|---|---|---|
| Prompt caching | TTFT (skips prefill) | Needs identical repeated prefix |
| Smaller or distilled model | Per-token and TTFT | Possible quality drop |
| Parallel tool and retrieval calls | Upstream wall time | Only independent calls |
| Shorter output (max tokens, format) | Total via per-token term | May truncate content |
| Streaming | Perceived latency | No change to total |
| Speculative decoding | Per-token | Setup, serving support |

Parallelism matters more than people expect: if a step issues three independent retrieval or tool calls, running them concurrently makes the wall time the max of the three, not the sum.

## Failure modes

- Optimizing average latency while p95 and p99 blow out: tail latency is what users complain about.
- Shrinking the model everywhere, trading quality for speed on requests that did not need it.
- Blocking the stream on a post-hoc validation pass, erasing the perceived-latency win.
- Ignoring output length: a verbose format silently inflates total time through the per-token term.

> **Pitfall.** A guardrail or judge that runs after generation and before the user sees anything turns a streamed response back into a blocking one. Stream first, validate in parallel or on the tail.

> **Interview.** Separate TTFT (prefill, upstream) from per-token (decode, bandwidth), draw a per-stage budget, then name the lever per stage: cache or shorten context for TTFT, parallelize independent calls for upstream, stream for perception, smaller model or speculative decoding for decode. Always talk in percentiles, not averages.

```recall
Q: Why does streaming not reduce total latency but still help users?
A: Tokens are still generated at the same rate, so completion time is unchanged. But the user sees the first token at TTFT instead of at completion, which collapses perceived waiting.
Q: Which stage sets TTFT and which sets per-token latency?
A: TTFT is set by prefill (encoding all input tokens) plus upstream work like retrieval. Per-token latency is set by the decode loop, which generates one token at a time and is memory-bandwidth bound.
Q: You have three independent retrieval calls on the critical path. What is the fix?
A: Run them in parallel so the wall time is the slowest of the three rather than the sum. Only independent calls can be parallelized this way.
Q: Why measure p95 or p99 instead of average latency?
A: Users feel the slow requests. A good average can hide a long tail where a meaningful fraction of requests are painfully slow, which is what drives complaints.
Q: How does a post-generation guardrail hurt latency, and what is the fix?
A: Running a validator after generation and before showing output blocks the stream, erasing the perceived-latency win. Stream the output and run the check in parallel or only on the completed tail.
```

===DEEPER===

## Why decode is memory-bandwidth bound

Each decode step must read the full model weights and the growing KV cache from GPU memory to produce one token. The arithmetic per token is small relative to the bytes moved, so the step is limited by memory bandwidth, not compute. This is why generating 500 tokens takes roughly 500 times the time of generating one, and why batching many requests together raises throughput (more useful compute per weight read) without lowering any single request's per-token latency. Prefill, by contrast, processes all input tokens in parallel and is compute-bound, which is why a long prompt inflates TTFT but a long output inflates total time through the per-token term.

## Speculative decoding

Speculative decoding uses a small draft model to propose several tokens ahead, which the large model then verifies in a single forward pass. When the draft is right, you get multiple tokens for one large-model step, cutting per-token latency; when it is wrong, you fall back with no correctness loss, since the large model always has the final say. The win depends on draft acceptance rate and the draft model being much cheaper than the target. It is a serving-side feature, so it needs infrastructure support, but it reduces latency without changing the output distribution.

## Perceived latency as a design surface

Perceived latency is a product lever, not just an engineering one. Show a streaming cursor or a skeleton immediately so the user registers progress at TTFT. Render partial structure as it streams (headings, list items) rather than buffering until complete. Put the cheapest, most-likely-useful content first in the generation order so the earliest tokens already help. For agentic flows, stream intermediate steps (searching, reading, drafting) so a 20-second task feels like watching work rather than staring at a spinner. These do not touch total latency at all, yet they move the metric users actually report.

## Measuring it honestly

Record TTFT and total latency separately, both as distributions, and alert on p95 and p99 rather than the mean. Attribute each stage with spans (see the observability lesson): embed, search, rerank, prefill, decode, and any guardrail. A latency regression almost always lives in one stage, and without per-stage spans you are guessing. Watch the correlation between output length and total latency, because a prompt change that makes the model more verbose will raise latency with no code change and no obvious cause.
