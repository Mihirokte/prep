---
id: ai-single-vs-multi-agent
chapter: ai-patterns
title: Single vs. multi-agent
minutes: 4
---
The headline number: Anthropic's own Research feature uses a lead agent that spawns parallel subagents, each with an isolated context window returning only a condensed 1,000–2,000 token summary. On an internal eval this multi-agent setup beat a single agent by **90.2%**, at roughly **15x** the token cost of a normal chat.

That 15x is the whole trade. Multi-agent **wins** for breadth-first, parallelisable exploration; it **loses** when the task is narrow, latency-sensitive, cost-constrained, or has tightly interdependent subtasks.

A 2026 Anthropic/Claude post names five coordination patterns and when to use each:

- **generator-verifier** — quality-critical output with explicit criteria.
- **orchestrator-subagent** — clear decomposition into bounded subtasks.
- **agent teams** — parallel, independent, long-running subtasks.
- **message bus** — event-driven pipelines and growing agent ecosystems.
- **shared-state** — collaborative work building on each other's findings.

Their recommendation: **start with the simplest pattern and evolve based on where it struggles** — never pick one because it "sounds sophisticated." And say the quiet part if asked to judge the hype — Anthropic's own line is that *"true multi-agent systems are still in their infancy."* That's a direct quote, not your opinion.

===DEEPER===
**Deeper mechanism.** The 15x cost isn't overhead you can optimise away — it's structural. A lead agent plus N subagents means N separate context windows, each re-reading its slice of the task, each doing its own tool calls, plus the lead's synthesis pass. Where the design earns that cost:

- **Context isolation.** Each subagent explores in a *clean* window and returns only a condensed 1,000–2,000 token summary. The lead never sees the subagent's messy intermediate transcript, so the lead's own context stays small and high-signal — this is the real win, not "more brains."
- **Parallelism.** Breadth-first tasks (research 8 competitors, check 12 files) run concurrently; wall-clock time drops even as token cost rises.
- **The failure mode.** Interdependent subtasks. If subagent B needs subagent A's output, you've serialised them *and* paid the coordination tax — worse than a single agent. Multi-agent wins only when subtasks are genuinely independent.

```mermaid
sequenceDiagram
    participant Lead
    participant A as Subagent A
    participant B as Subagent B
    Lead->>A: bounded subtask (own context)
    Lead->>B: bounded subtask (own context)
    A-->>Lead: 1-2k token summary
    B-->>Lead: 1-2k token summary
    Note over Lead: synthesize; subagent transcripts never enter lead context
```

**Worked example.** "Compare our pricing against 6 competitors." Single agent: sequential, 6 web trips crammed into one window that bloats and degrades by competitor 4. Multi-agent: lead spawns 6 subagents, each researches one competitor in isolation and returns a 1.5k-token digest; lead synthesizes 6 clean digests. On Anthropic's internal research eval this shape beat a single agent by 90.2% — at ~15x tokens.

**The pitfall.** Reaching for multi-agent because it "sounds sophisticated" on a narrow, latency-sensitive, or tightly-coupled task. You pay 15x and get worse coordination. The 90.2% number is for *breadth-first, parallelisable* work only — quoting it for the wrong task shape is the trap.

**Common follow-ups**

- *When is single agent the right call?* Narrow scope, latency- or cost-sensitive, or interdependent subtasks. Start here by default.
- *What actually justifies the 15x?* Parallelisable breadth plus context isolation — subagents return summaries so the lead's window never bloats.
- *Which coordination pattern do you pick?* Simplest that fits: generator-verifier (quality gates), orchestrator-subagent (clear decomposition), agent teams (independent long tasks), message bus (event pipelines), shared-state (collaborative). Evolve from the simplest.
- *(2026, fast-moving)* Anthropic's own framing is that true multi-agent systems are "in their infancy" — patterns and tooling are still churning; don't present any as settled.
