---
id: ai-prompt-caching
chapter: ai-production
title: Cost and latency: prompt caching
minutes: 4
---
Prompt caching is the single biggest cost lever documented with hard numbers, because it charges you far less for the *repeated prefix* of your calls.

- **OpenAI** — automatic on gpt-4o and newer, no code changes, no extra fee: up to **80% latency reduction** and up to **90% input-token cost reduction** on cache hits.
- **Anthropic** — explicit opt-in via `cache_control` breakpoints marking the end of a cacheable prefix. Writing a 5-minute cache costs ~1.25x base input price; reading from cache costs ~0.1x. (Verify exact multipliers against current pricing — they change.)

The catch that gets tested: **caching only helps if the prefix is byte-identical across calls.** If your retrieved RAG context changes every turn and sits *before* the cache breakpoint, you get zero cache hits. So ordering matters — put stable content (system prompt, tool definitions) first, variable content (the retrieved context, the user turn) last.

This is also why "long context is too expensive" arguments from 2023 are weaker now: caching makes the repeated long prefix cheap. It matters most for long, repeated system prompts and RAG pipelines that re-send the same context across turns.
