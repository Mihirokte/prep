---
id: ai-prompt-caching
chapter: ai-production
title: Prompt caching
minutes: 7
---
Prompt caching reuses the computed state of a repeated prompt prefix instead of recomputing it on every call. It is the single biggest documented cost and latency lever for repeated workloads, and interviewers probe it because the win is real but conditional: it only fires when the prefix is byte-identical across calls. Get the prompt ordering wrong and you pay a write premium for nothing.

## How it works

A model processes a prompt in two phases. Prefill reads all input tokens and builds a key-value cache of attention state; decode then generates output one token at a time. Prefill over a long, repeated prefix is pure waste if you send the same tokens every call. Prompt caching stores the prefill state for a prefix and serves it from cache on the next request that starts with the same bytes.

Two provider styles, verified against vendor docs (as of 2026, re-check):

- OpenAI caches automatically on prompts over 1024 tokens, matching the longest previously computed prefix in 128-token increments, with no code change and no extra fee. It advertises up to 80 percent time-to-first-token reduction and up to 90 percent input-token cost reduction on hits (OpenAI, Prompt Caching in the API).
- Anthropic is explicit opt-in: you mark a `cache_control` breakpoint at the end of a cacheable prefix. A 5-minute cache write costs 1.25x the base input price, a 1-hour write costs 2x, and a read costs 0.1x (Anthropic pricing docs).

```flow
dir: LR
req: Request | actor
prefix: Stable prefix | step
cache: KV cache | store
llm: LLM decode | model
req -> prefix : tokens
prefix -> cache : lookup
cache -> llm : reuse state
llm -> req : output
prefix --> llm : miss recompute
```

```check
Q: Each call sends a timestamp line, then the system text, then the tool schemas, then the user message. Cache hits stay near zero. Why?
- The tool schemas are too long for the cache to hold
* The timestamp changes each call, so no prefix ever matches
- The user message changes each call, so the cache resets
Why: A prompt cache matches from the first token forward and stops at the first difference. A timestamp at the top differs on every call, so nothing after it can match. A changing user message is normal: it sits at the end, after the cached prefix. Move the timestamp, and anything else that varies, after the stable parts.
```

## A worked cost model

Take Anthropic's multipliers and a prompt with a 10k-token stable prefix (system prompt plus tool schemas plus a fixed knowledge block) reused across 20 turns of a conversation, each turn adding a small variable suffix.

Without caching: 20 turns each re-process 10k prefix tokens = 200k prefix-token-equivalents at 1.0x = 200 units.

With a 5-minute cache: turn 1 writes the prefix at 1.25x (12.5 units), turns 2 through 20 read at 0.1x (19 x 1.0 unit = 19 units). Total about 31.5 units for the prefix. That is roughly a 6x reduction on the prefix cost alone, and the gap widens the more you reuse.

```bars
title: Prefix cost over 20 reuses (illustrative, Anthropic ratios)
unit: units
Uncached | 200
Cached write plus reads | 31.5
```

The break-even is low: at 0.1x read and 1.25x write, two reuses already beat two uncached requests (1.25 + 0.1 = 1.35 < 2.0).

## Ordering a prompt for cacheability

The hard rule the question tests: caching only helps if the prefix is byte-identical. One changed token anywhere in the prefix invalidates everything after it. So structure the prompt stable-first, variable-last.

```stack
title: Cache-friendly prompt layout
unit: ordinal
System prompt | 1 | stable, cache
Tool schemas | 2 | stable, cache
Fixed knowledge | 3 | stable, cache
Retrieved chunks | 4 | varies per query
Chat history | 5 | grows each turn
User message | 6 | varies
```

Put the breakpoint after the fixed knowledge block. Everything above it caches; everything below changes freely without breaking the cache.

> **Pitfall.** Injecting a timestamp, a request id, or freshly retrieved RAG context near the top of the prompt silently zeroes your hit rate while you keep paying the write premium.

## Trade-offs

| Lever | Win | Cost or limit |
|---|---|---|
| Automatic caching | No code, free | Only fires on long repeated prefixes |
| Explicit breakpoints | Precise control | Write premium if reuse is low |
| Long TTL (1h) | Survives idle gaps | Higher write multiplier |

## Failure modes

- Prefix churn: any non-deterministic early token kills the hit.
- Low reuse: a prefix read once never recovers its write premium.
- TTL expiry: a cache that lapses between calls forces a fresh write.

> **Interview.** A strong answer names the mechanism (prefill state reuse), the ordering rule (stable prefix first), and the break-even (reads at 0.1x pay back a 1.25x write in two uses), then connects it to why long context is no longer automatically too expensive.

```recall
Q: Why does putting retrieved RAG context at the top of the prompt destroy caching?
A: Caching keys on a byte-identical prefix. Retrieved context changes per query, so an early variable block invalidates the cache for everything after it, giving zero hits while you still pay the write premium.
Q: With a 1.25x write and 0.1x read, how many reuses break even?
A: Two. 1.25 + 0.1 = 1.35 beats 2.0 for two uncached requests, so from the second read on you are saving.
Q: Why does caching make the 2023 long-context-is-too-expensive argument weaker?
A: The expensive part was re-processing a long repeated prefix every call. Caching serves that prefix from stored state at a fraction of the price, so a long stable context amortizes across reuses.
Q: What does prefill do, and why is it the part caching targets?
A: Prefill reads all input tokens and builds the KV attention state before any output. For a repeated prefix that work is identical each call, so caching stores and replays it.
```

===DEEPER===

## Why the KV cache is what gets stored

During prefill the model computes, for every input token and every layer, the key and value vectors that later tokens attend to. That is the KV cache. For a fixed prefix those vectors are deterministic, so a provider can serialize them, key them by a hash of the prefix bytes, and restore them on a matching request. Decode then starts immediately against the restored cache. This is why the saving shows up most as time-to-first-token: prefill is skipped, and TTFT is dominated by prefill on long inputs.

## Scope and invalidation

Caches are scoped and short-lived by design. Anthropic uses a sliding TTL (5 minutes default, refreshed on each hit, with a 1-hour option), so an actively reused prefix stays warm while an idle one lapses. The cache is also typically scoped to an organization or account, not shared across tenants, which matters for both correctness and data isolation. Any change inside the cached span, including tool-schema edits mid-conversation, forces a rewrite of the whole span, which is why mid-stream tool changes historically triggered an expensive 12.5x re-process penalty (0.1x read lost, 1.25x write paid).

## Interaction with routing and batching

Caching composes with the other cost levers but can conflict with routing. If a router sends similar requests to different models, each model keeps its own cache, so cache hit rate drops as routing fans out. Batch APIs are a separate discount path (asynchronous, roughly half price) and are usually a better fit than caching for one-shot bulk jobs where there is no repeated prefix to reuse. The decision rule: caching for repeated-prefix interactive traffic, batching for latency-tolerant one-shot volume.

## Measuring it

Instrument cache hit rate as a first-class metric: fraction of input tokens served from cache, and cost per request split into write, read, and uncached buckets. A healthy repeated-prefix workload should see the large majority of prefix tokens as reads. A sudden drop usually means a prefix token started varying. Log the first N bytes of the cached span hash per request so you can diff two requests that should have hit the same cache and find the token that diverged.
