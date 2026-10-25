---
id: scratch-14-12-anthropic-workflow-patterns
chapter: scratch-14-agent-engineering
title: Anthropic's Workflow Patterns: Simple Over Complex
minutes: 0
---
> Schluntz and Zhang (Anthropic, Dec 2024) distinguish workflows (predefined paths) from agents (dynamic tool-use). Five workflow patterns cover most cases. Start with direct API calls. Add agents only when steps cannot be predicted.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 14 · 01 (Agent Loop)
**Time:** ~60 minutes

## Learning Objectives

- Name Anthropic's five workflow patterns: prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer.
- Explain the agent-vs-workflow distinction and the engineering cost of each.
- Identify when to pick a workflow over an agent (and vice versa).
- Implement all five patterns in stdlib against a scripted LLM.

## The Problem

Teams reach for multi-agent frameworks for problems that want a single function call. The cost is real: frameworks add layers that obscure prompts, hide control flow, and invite premature complexity. Schluntz and Zhang's Dec 2024 post is the most-cited industry pushback: start simple, add complexity only when it earns its cost.

## The Concept

### Workflows vs agents

- **Workflow.** LLMs and tools orchestrated through predefined code paths. Engineers own the graph.
- **Agent.** LLMs dynamically direct their own tools and take their own steps. The model owns the graph.

Both have their place. Workflows are cheaper, faster, and easier to debug. Agents unlock open-ended problems but make failure modes harder to reason about.

### The augmented LLM

Foundation for all five patterns: one LLM with three capabilities wired in — search (retrieval), tools (actions), memory (persistence). Any API call can use these.

### The five patterns

1. **Prompt chaining.** Output of call 1 is input to call 2. Use when a task has a clean linear decomposition. Optional programmatic gates between steps.

2. **Routing.** A classifier LLM picks which downstream LLM or tool to invoke. Use when categorically different inputs need different handling (tier-1 support vs refund vs bug vs sales).

3. **Parallelization.** Run N LLM calls concurrently, aggregate results. Two shapes: sectioning (different chunks) and voting (same prompt, N runs, majority/synthesis).

4. **Orchestrator-workers.** An orchestrator LLM dynamically decides which workers (also LLMs) to run and synthesizes their output. Similar to agent loops but the orchestrator does not loop indefinitely.

5. **Evaluator-optimizer.** One LLM proposes an answer, another LLM evaluates it. Iterate until the evaluator passes. This is Self-Refine (Lesson 05) generalized.

### Where workflows beat agents

- **Predictable tasks.** If you can enumerate the steps, you should.
- **Cost-bound tasks.** Workflows have bounded step counts; agents can spiral.
- **Compliance-bound tasks.** Auditors want to read the graph, not infer it from trajectories.

### Where agents beat workflows

- **Open-ended research.** When the next step depends on what the last step returned.
- **Variable-length tasks.** Minutes to hours of work where step count is unknown.
- **Novel domains.** When you don't yet know the right workflow — exploration first, codify later.

### The context-engineering companion

"Effective context engineering for AI agents" (Anthropic 2025) formalizes the adjacent discipline: the 200k window is a budget, not a container. What to include, when to compact, when to let context grow. Covered in detail in Phase 14 lesson on context compression (Phase 14 earlier lesson 06 in this curriculum before the renumber).

## Build It

`code/main.py` implements all five workflow patterns against a `ScriptedLLM`:

- `prompt_chain(input, steps)` — sequential.
- `route(input, classifier, handlers)` — classification + dispatch.
- `parallel_vote(prompt, n, aggregator)` — N runs, aggregate.
- `orchestrator_workers(task, workers)` — orchestrator picks workers.
- `evaluator_optimizer(task, proposer, evaluator, max_iter)` — loop until pass.

Run it:
```
python3 code/main.py
```
Each pattern prints its trace. Total lines of code per pattern is ~10-15; the cost of a framework is measured in thousands.

## Use It

- Direct API calls for most tasks.
- Framework only when the pattern genuinely needs durable state (LangGraph), actor-model concurrency (AutoGen v0.4), or role templating (CrewAI).
- Reach for the Claude Agent SDK when you want the Claude Code harness shape without rebuilding it.

## Ship It

`outputs/skill-workflow-picker.md` picks the right pattern for a given task description, including the decision rationale and the refactor path to an agent if workflows fall short.

Source: [AI Engineering from Scratch, phase 14, 12-anthropic-workflow-patterns](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/12-anthropic-workflow-patterns), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: How does Anthropic distinguish a workflow from an agent?
A: Workflows are engineer-owned predefined graphs; agents are model-owned dynamic tool direction. Workflow = predefined code path the engineer owns; agent = the model owns the graph.
Q: What are the three capabilities of the augmented LLM that underpins all five patterns?
A: Search (retrieval), tools (actions), memory (persistence). The atomic unit is one LLM with retrieval, tools, and memory wired in.
Q: Which is NOT one of the five Anthropic workflow patterns?
A: Gradient distillation. The five are prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer. Gradient distillation is a training concept.
Q: Which two shapes does parallelization come in?
A: Sectioning (different chunks) and voting (same prompt N times, aggregate). Parallelization is sectioning or voting; both fan out N calls and aggregate.
Q: Which workflow pattern is Self-Refine generalized?
A: Evaluator-optimizer. Evaluator-optimizer is the Anthropic name for the Self-Refine / CRITIC iterative pattern.
Q: When do workflows beat agents according to the lesson?
A: On predictable, cost-bounded, or compliance-bounded tasks where the graph can be enumerated and audited. Workflows are cheaper, easier to debug, and auditable; pick them when steps are knowable.
Q: What is the lesson's recommended default starting point?
A: Direct API calls; add frameworks only when durable state, actor concurrency, or role templating earns its cost. Schluntz and Zhang: start simple; add framework complexity only when justified.
```

===DEEPER===
## Exercises

1. Implement routing with a confidence threshold. Below threshold -> escalate to human. Where does the threshold land for a tier-1 support use case?
2. Add a timeout to `parallel_vote`. What happens when one call hangs? How do you aggregate with missing votes?
3. Turn `evaluator_optimizer` into a bandit: keep the top-2 outputs across iterations so a late good result doesn't get overwritten by a late bad one.
4. Combine prompt chaining with routing: a router picks one of three chains. Measure token cost vs a single big-prompt alternative.
5. Pick one of your production features. Draw the workflow graph. Count steps. Would an agent actually be better here?

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|------------------------|
| Workflow | "Predefined flow" | Engineer-owned graph of LLM and tool calls |
| Agent | "Autonomous AI" | Model-owned graph; dynamic tool direction |
| Augmented LLM | "LLM with tools" | LLM + search + tools + memory; the atomic unit |
| Prompt chaining | "Sequential calls" | Output of call N is input to call N+1 |
| Routing | "Classifier dispatch" | Pick which chain/model handles the input |
| Parallelization | "Fan out" | N concurrent calls; aggregate by sectioning or voting |
| Orchestrator-workers | "Dispatcher agent" | Orchestrator LLM picks specialist LLMs dynamically |
| Evaluator-optimizer | "Proposer + judge" | Iterate until evaluator passes; Self-Refine generalized |

## Further Reading

- [Anthropic, Building Effective Agents (Dec 2024)](https://www.anthropic.com/research/building-effective-agents) — the five workflow patterns
- [Anthropic, Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — the companion discipline
- [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview) — when stateful graphs earn their cost
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — the orchestrator-workers pattern, productized
