---
id: ai-agents-vs-workflows
chapter: ai-patterns
title: Agents vs. workflows
minutes: 4
---
Anthropic's Dec 2024 "Building effective agents" drew the distinction the field still uses:

- **Workflows** — LLMs and tools orchestrated through *predefined code paths*. You write the control flow.
- **Agents** — the LLM *dynamically directs its own process and tool use*, deciding the next step from what it observes. By late 2025 Anthropic's working definition compressed to: **an LLM autonomously using tools in a loop.**

The named workflow patterns (still the standard vocabulary):

- **Prompt chaining** — sequential steps, each call consumes the prior output, with programmatic gates between them.
- **Routing** — classify the input, dispatch to a specialised prompt or model (cheap model for easy, capable model for hard).
- **Parallelization** — *sectioning* (independent subtasks in parallel) or *voting* (same task run several times for confidence).
- **Orchestrator-workers** — a central LLM decomposes a task *at runtime* and delegates, because the subtasks can't be predicted in advance (a coding agent doesn't know how many files it'll touch).
- **Evaluator-optimizer** — one LLM generates, another critiques, in a loop.

Anthropic's explicit guidance: **find the simplest solution first.** Often a single optimised call with retrieval is enough. Reach for agents only when the task is open-ended, the number of steps can't be hardcoded, and you can tolerate the latency, cost, and error-compounding of autonomous operation.
