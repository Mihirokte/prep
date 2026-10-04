---
id: ai-agents-vs-workflows
chapter: ai-agents
title: Agents versus workflows
minutes: 8
---
The split between workflows and agents is the first distinction an interviewer draws, because it decides how much control you hand the model and therefore your cost, latency, and failure profile. Anthropic's "Building effective agents" (Dec 2024) set the vocabulary the field still uses. Get the definition exact, give a concrete example of each, and know the one question that decides between them.

## The definition split

Both are agentic systems. The difference is who owns the control flow.

- A workflow orchestrates LLMs and tools through predefined code paths. You write the control flow; the model fills in steps you laid out.
- An agent lets the model dynamically direct its own process and tool use, deciding the next step from what it observes. By late 2025 Anthropic's working shorthand compressed to an LLM autonomously using tools in a loop.

```flow
dir: TB
task: Task | actor
q: Who picks next step? | gate
wf: Workflow | step
ag: Agent | model
code: You wrote the path | step
loop: Model decides, loops on tools | step
task -> q : incoming
q -> wf : code decides
q -> ag : model decides
wf -> code : predictable
ag -> loop : flexible
```

The test is a single question: is the sequence of steps fixed and knowable at build time, or must it be decided at runtime from what the model sees? Fixed means workflow. Decided at runtime means agent.

## A concrete example of each

A workflow: triage an incoming support email. Classify it, retrieve the relevant policy, draft a reply, run a safety check, and send if the check passes. Every input takes the same five steps in the same order. You wrote that path. The model makes each step smart, but it never chooses what to do next, so the system is predictable and cheap and you can test each stage in isolation.

An agent: fix a failing test in a codebase. The model must run the tests, read the traceback, decide which file to open, edit it, re-run, and repeat, and the number and order of those steps depend on what each observation reveals. You cannot hardcode the path because you do not know how many files it will touch or what the error will be. The loop earns its cost here precisely because the control flow is unknowable in advance.

## When the loop earns its cost

Agents trade latency, cost, and error compounding for flexibility. The trade is worth it only under specific conditions.

| Signal | Favors workflow | Favors agent |
|---|---|---|
| Step sequence | Fixed, knowable upfront | Must be decided at runtime |
| Step count | Bounded, small | Open-ended |
| Latency budget | Tight | Tolerant |
| Cost sensitivity | High | Can absorb more tokens |
| Error tolerance | Low, needs predictability | Can recover mid-task |

```bars
title: Relative token cost by system shape (illustrative)
unit: x
Single augmented call | 1
Workflow with few steps | 2
Autonomous agent | 4
```

> **Interview.** The strong answer resists reaching for an agent. Start with the simplest thing that works, often one call with retrieval, then a workflow, and only make it an agent when the task is open-ended, the steps cannot be hardcoded, and the latency and cost are acceptable. Naming the trade-offs is what separates a senior answer from "agents are more powerful."

## The simplest-solution rule

Anthropic's explicit guidance is to find the simplest solution first and increase complexity only when needed. For many applications a single optimised call with retrieval and in-context examples is enough. The cost of an agent is not just tokens: autonomy multiplies per-step error, makes behaviour harder to test, and makes failures harder to reproduce. Reach for it when the flexibility is the point, not because it sounds advanced.

```recall
Q: What single question decides workflow versus agent?
A: Is the sequence of steps fixed and knowable at build time (workflow, you write the control flow), or must it be decided at runtime from what the model observes (agent, the model directs its own process)?
Q: Why not default to an agent since it is more flexible?
A: Agents trade latency, cost, and error compounding for flexibility, are harder to test and reproduce, and multiply per-step error. Most tasks are solved more cheaply and reliably by a single call or a workflow.
Q: Give a task that must be an agent and say why.
A: Fixing a failing test: the number and order of steps depend on each observation (the traceback, which file, whether the fix works), so the control flow cannot be hardcoded.
Q: What is Anthropic's late-2025 shorthand for an agent?
A: An LLM autonomously using tools in a loop, deciding each next step from what it observes.
```

===DEEPER===

### Agentic systems is the umbrella, not a third category

A common slip is to treat "agentic" as a synonym for "agent." Anthropic uses agentic systems as the umbrella covering both workflows and agents, with the control-flow owner as the dividing line inside it. This matters in interviews because candidates who call every LLM-plus-tool system an agent lose the distinction that the whole discussion rests on. A fixed five-step pipeline that calls tools is an agentic system and a workflow; it is not an agent, because the model never chose the sequence.

### The augmented LLM sits under both

Underneath either shape is the same unit: an LLM augmented with retrieval, tools, and memory. A workflow wires several augmented calls together along a path you define. An agent puts one augmented call in a loop and lets it decide when to call a tool and when to stop. Seeing both as compositions of the same building block is why you can start with one call and grow into a workflow and then an agent without rearchitecting, and why the decision is incremental rather than a fork at the start.

### Error compounding is the hidden cost of autonomy

The reason "just make it an agent" is dangerous is multiplicative error. If each step in an autonomous loop is 95% reliable and nothing checks intermediate results, a ten-step task is roughly 0.95^10, about 60% end to end. A workflow fights this with gates between fixed steps; an agent has fewer natural places to insert a gate because the steps are not known in advance. This is the concrete mechanism behind the advice to prefer workflows when you can, and it is the number to cite when asked why more autonomy is not free.

### Source and currency

The workflow-versus-agent definition, the agentic-systems umbrella, the augmented-LLM building block, and the simplest-solution-first guidance are from Anthropic, "Building effective agents" (Dec 2024). The compressed "LLM autonomously using tools in a loop" phrasing reflects Anthropic's later framing. The relative token figures (an agent around 4x a chat) come from Anthropic's multi-agent research write-up and are illustrative orders of magnitude, not a quote to pin to any one task (2026, re-check).
