---
id: scratch-14-28-orchestration-patterns
chapter: scratch-14-agent-engineering
title: Orchestration Patterns: Supervisor, Swarm, Hierarchical
minutes: 0
---
> Four orchestration patterns recur across 2026 frameworks: supervisor-worker, swarm / peer-to-peer, hierarchical, debate. Anthropic's guidance: "It's about building the right system for your needs." Start simple; add topology only when a single agent plus five workflow patterns is insufficient.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 14 · 12 (Workflow Patterns), Phase 14 · 25 (Multi-Agent Debate)
**Time:** ~60 minutes

## Learning Objectives

- Name the four recurring orchestration patterns and when each fits.
- Describe the 2026 LangChain recommendation: tool-call-based supervision vs supervisor libraries.
- Explain Anthropic's "build the right system" rule and how it gates topology choice.
- Implement all four in stdlib against a common scripted LLM.

## The Problem

Teams reach for "multi-agent" before they need it. Four patterns recur across frameworks; once you can name them, you can pick the right one — or skip topology entirely.

## The Concept

### Supervisor-worker

- A central routing LLM dispatches to specialist agents.
- Decides: loop back to self, hand off to specialist, terminate.
- Specialists do not talk to each other; all routing goes through the supervisor.

Frameworks: LangGraph `create_supervisor`, Anthropic orchestrator-workers, CrewAI Hierarchical Process.

**2026 LangChain recommendation:** do supervision through direct tool calls rather than `create_supervisor`. Gives finer context engineering control — you decide exactly what each specialist sees.

### Swarm / peer-to-peer

- Agents hand off directly via a shared tool surface.
- No central router.
- Lower latency than supervisor (fewer hops).
- Harder to reason about (no single point of control).

Frameworks: LangGraph swarm topology, OpenAI Agents SDK handoffs (when all agents can hand off to all others).

### Hierarchical

- Supervisors managing sub-supervisors managing workers.
- Implemented as nested subgraphs in LangGraph; nested crews in CrewAI.
- Scales to large agent populations at the cost of operational complexity.

When you need it: when a single supervisor's context budget cannot hold descriptions of all specialists.

### Debate

- Parallel proposers + iterative cross-critique (Lesson 25).
- Not really orchestration — more verification — but shows up as a topology choice in frameworks.

### Autonomous crews vs deterministic flows

CrewAI formalizes two deployment modes:

- **Flow** for deterministic event-driven automation (recommended starting point for production).
- **Crew** for autonomous role-based collaboration.

This is orthogonal to the four patterns above but maps to topology: Flow is typically supervisor or hierarchical; Crew is typically supervisor with an LLM router.

### Anthropic's guidance

"Success in the LLM space isn't about building the most sophisticated system. It's about building the right system for your needs."

Decision order:

1. Single agent + workflow patterns (Lesson 12) — start here.
2. Supervisor-worker — when you have 2-4 specialists.
3. Swarm — when latency matters more than reasoning clarity.
4. Hierarchical — only when supervisor context budget fails.
5. Debate — when accuracy matters more than cost.

### Where this pattern goes wrong

- **Topology-first thinking.** "We need multi-agent" before identifying what problem multi-agent solves.
- **Bouncing handoffs in swarm.** A -> B -> A -> B. Use hop counters.
- **Fake hierarchy.** Three layers because "enterprise"; two actual teams. Collapse.

## Build It

`code/main.py` implements all four patterns in stdlib against a scripted LLM:

- `Supervisor` — central router.
- `Swarm` — peer-to-peer with direct handoffs.
- `Hierarchical` — supervisors of supervisors.
- `Debate` — parallel proposers + critique.

Each pattern handles the same three-intent task (refund / bug / sales). Trace shapes differ.

Run it:
```
python3 code/main.py
```
Output: per-pattern trace + op count. Supervisor is cleanest; swarm is shortest; hierarchical is deepest; debate is most expensive.

## Use It

- **LangGraph** for supervisor and hierarchical (nested subgraphs).
- **OpenAI Agents SDK** for handoffs-as-tools (supervisor-shaped).
- **CrewAI Flow** for production deterministic.
- **Custom** for debate or when you want exact control.

## Ship It

`outputs/skill-orchestration-picker.md` picks a topology and implements it.

Source: [AI Engineering from Scratch, phase 14, 28-orchestration-patterns](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/28-orchestration-patterns), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Which four orchestration patterns does the lesson list?
A: Supervisor-worker, swarm/peer-to-peer, hierarchical, debate. Supervisor-worker, swarm, hierarchical, and debate recur across 2026 frameworks.
Q: What is the 2026 LangChain recommendation regarding supervision?
A: Prefer direct tool calls over create_supervisor for finer context-engineering control. Tool-call-based supervision gives you precise control over what each specialist sees.
Q: What distinguishes a swarm from a supervisor-worker topology?
A: Swarm has no central router; agents hand off directly via a shared tool surface. Swarm is peer-to-peer; supervisor centralizes routing through one LLM.
Q: When is hierarchical orchestration justified?
A: When a single supervisor's context budget cannot hold descriptions of all specialists. Nested supervisors are for large specialist populations that exceed one supervisor's budget.
Q: What is the recommended decision order Anthropic supports?
A: Start with a single agent plus workflow patterns; add topology only when needed; supervisor before swarm before hierarchical; debate when accuracy beats cost. Anthropic's guidance is to build the right system for your needs, not the most sophisticated.
Q: What is fake hierarchy in this lesson?
A: Three layers of supervisors because 'enterprise' when there are only two actual teams; collapse it. Layers that do not correspond to real teams add operational complexity without payoff.
Q: How do you mitigate bouncing handoffs in a swarm (A -> B -> A -> B)?
A: Add a hop counter and refuse after N transfers. A hop counter caps swarm cycles before they loop indefinitely.
```

===DEEPER===
## Exercises

1. Convert a supervisor-worker to a swarm by removing the router. What breaks? What improves?
2. Add a hop counter to the swarm: refuse after 3 handoffs. Does it catch A->B->A bouncing?
3. Build a two-level hierarchical system for a 12-specialist domain. Where does the context budget fail without nesting?
4. Profile the four patterns on a production-shaped workload. Which wins on which metric (latency, cost, accuracy, debuggability)?
5. Read Anthropic's "Building Effective Agents" post. Map each of your production flows to one of the four. Any that don't map cleanly?

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|------------------------|
| Supervisor-worker | "Router + specialists" | Central LLM dispatches to specialists; they don't talk to each other |
| Swarm | "Peer-to-peer" | Direct handoffs via shared tools; no central router |
| Hierarchical | "Supervisors of supervisors" | Nested subgraphs for large populations |
| Debate | "Proposer + critique" | Parallel proposers, cross-critique (Lesson 25) |
| Tool-call-based supervision | "Supervisor without a library" | Implement supervisor as direct tool calls for context control |
| Crew | "Autonomous team" | CrewAI's role-based collaboration mode |
| Flow | "Deterministic workflow" | CrewAI's event-driven production mode |

## Further Reading

- [Anthropic, Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — five patterns + agent vs workflow
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview) — supervisor, swarm, hierarchical
- [CrewAI docs](https://docs.crewai.com/en/introduction) — Crew vs Flow
- [Du et al., Society of Minds (arXiv:2305.14325)](https://arxiv.org/abs/2305.14325) — debate pattern
