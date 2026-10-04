---
id: ai-structured-outputs
chapter: ai-patterns
title: Prompting and structured outputs
minutes: 4
---
Prompting fluency is assumed, not impressive on its own. What genuinely changed since 2023-era "prompt engineering" tips is that **structured outputs became a first-class API feature, not a prompting trick.**

OpenAI shipped Structured Outputs (Aug 2024): set `strict: true` on a schema and the output is *guaranteed* to match your JSON Schema, enforced at generation time rather than merely requested. In practice you define the schema with Pydantic (Python) or Zod (TypeScript) instead of hand-writing JSON Schema. Anthropic's tool use works the same way — you define tools with JSON Schema input, the model emits a `tool_use` block, you execute and return a `tool_result`.

The mental model: **"call this tool with this exact shape" and "return this exact JSON shape" are now the same underlying mechanism.** Function calling and structured outputs have converged.

The design question that survives strict mode: what do you do when the *shape* is valid but the *content* is wrong — a hallucinated field value that parses fine? Strict mode removes most parse-error handling but does not remove the need to validate the values themselves.

(Fast-moving: exact strictness guarantees and grammar-engine details differ per provider and per model version — check the current docs before quoting specifics.)
