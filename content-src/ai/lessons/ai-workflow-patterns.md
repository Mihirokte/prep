---
id: ai-workflow-patterns
chapter: ai-agents
title: The five workflow patterns
minutes: 9
---
A workflow orchestrates LLM calls through code paths you write, not through a model that decides its own next step. Anthropic's "Building effective agents" (Dec 2024) names five patterns that cover almost every production workflow, and interviewers use them as a shared vocabulary. Knowing when each one applies, and the one cheaper option that often beats all of them, is the point.

## The augmented LLM is the building block

Every pattern composes the same unit: a single LLM call augmented with retrieval, tools, and memory. Before reaching for any pattern, ask whether one augmented call with good retrieval and a few in-context examples already solves the task. Anthropic's own guidance is to find the simplest solution first and add structure only when a concrete failure forces it. The patterns below are what you add, in rough order of cost, when one call is not enough.

## Prompt chaining

Decompose the task into a fixed sequence of steps, each call consuming the previous output. Add a programmatic gate between steps to catch a bad intermediate result before it propagates.

```flow
dir: LR
in: Input | actor
s1: Step 1 call | model
gate: Check output | gate
s2: Step 2 call | model
out: Result | step
in -> s1 : task
s1 -> gate : draft
gate -> s2 : passed
gate --> in : failed, retry
s2 -> out : final
```

Use it when the task decomposes cleanly into fixed subtasks and you want to trade latency for accuracy by making each call easier. Example: write a document outline, check it meets criteria, then write the document from the outline.

## Routing

Classify the input, then dispatch to a specialised prompt or model. A cheap model handles easy inputs, a capable model handles hard ones, and each downstream prompt stays focused instead of trying to cover every case at once.

```flow
dir: LR
in: Query | actor
cls: Classify | model
easy: Cheap model | model
hard: Capable model | model
out: Answer | step
in -> cls : input
cls -> easy : simple
cls -> hard : complex
easy -> out : response
hard -> out : response
```

Use it when inputs fall into distinct categories that are better handled separately and classification is reliable. Example: route general questions, refund requests, and technical support into different pipelines.

## Parallelization

Run several LLM calls at once and aggregate their outputs. It has two variations. Sectioning splits a task into independent subtasks run in parallel. Voting runs the same task several times and combines the results for confidence.

```flow
dir: TB
in: Task | actor
split: Fan out | step
a: Call A | model
b: Call B | model
c: Call C | model
agg: Aggregate | step
out: Result | step
in -> split : task
split -> a : section or vote
split -> b : section or vote
split -> c : section or vote
a -> agg : output
b -> agg : output
c -> agg : output
agg -> out : combined
```

Use sectioning for speed on independent parts, and voting when multiple attempts raise confidence. Example of sectioning: one model answers the user while a second screens the query for policy violations, which works better than asking one call to do both.

## Orchestrator-workers

A central LLM breaks the task into subtasks at runtime and delegates each to a worker call, then synthesises the results. The difference from parallelization is that the subtasks are not predefined, the orchestrator decides them from the input.

```flow
dir: TB
in: Task | actor
orch: Orchestrator | model
w1: Worker | model
w2: Worker | model
syn: Synthesize | model
out: Result | step
in -> orch : task
orch -> w1 : subtask decided at runtime
orch -> w2 : subtask decided at runtime
w1 -> syn : partial
w2 -> syn : partial
syn -> out : final
```

Use it when you cannot predict the subtasks in advance. A coding change does not know how many files it will touch until it reads them, so the orchestrator spawns a worker per file it discovers.

## Evaluator-optimizer

One LLM call generates a candidate, a second evaluates it against explicit criteria, and the generator revises using that feedback, in a loop until the evaluator passes it or a cap is hit.

```flow
dir: LR
gen: Generator | model
ev: Evaluator | gate
out: Result | step
gen -> ev : candidate
ev --> gen : feedback, revise
ev -> out : accepted
```

Use it when you have clear evaluation criteria and iteration measurably improves the output, for example literary translation or complex search where a first draft rarely lands.

> **Rule of thumb.** Add exactly one pattern when a specific failure demands it. A fixed pipeline with a quality problem wants evaluator-optimizer; unpredictable decomposition wants orchestrator-workers; distinct input types want routing.

## Trade-offs

| Pattern | Adds | Costs | Reach for when |
|---|---|---|---|
| Prompt chaining | Accuracy per step, gates | Serial latency | Fixed, decomposable task |
| Routing | Specialised handling, cheaper mix | A classifier to maintain | Distinct input categories |
| Parallelization | Speed or confidence | Parallel token spend | Independent parts or voting |
| Orchestrator-workers | Runtime decomposition | Unpredictable cost | Subtasks unknown in advance |
| Evaluator-optimizer | Iterative quality | Multiple round trips | Clear criteria, iteration helps |

The line to agents: all five are workflows, you own the control flow. The moment the model must decide the control flow itself, you have crossed into an agent loop, which costs and latency rise again.

```recall
Q: Why try a single augmented call before any pattern?
A: Many tasks are solved by one call with retrieval and in-context examples. Patterns add latency, cost, and failure surface, so you add one only when a concrete failure forces it.
Q: What distinguishes orchestrator-workers from parallelization?
A: Parallelization runs predefined subtasks; the orchestrator decides the subtasks at runtime from the input, so the number and nature of workers are not known in advance.
Q: When does evaluator-optimizer pay off, and when is it waste?
A: It pays off when there are clear evaluation criteria and iteration measurably improves output. It is waste when the first draft is already good enough or criteria are vague, because you pay for extra round trips with no gain.
Q: What separates every workflow pattern from an agent?
A: In a workflow you write the control flow in code; in an agent the model decides the next step dynamically. Crossing that line raises cost, latency, and error compounding.
```

===DEEPER===

### Sectioning versus voting, concretely

Both are parallelization, but they aggregate differently and solve different problems. Sectioning assigns each parallel call a different slice of the work and concatenates the outputs: call A drafts section one, call B drafts section two, and you stitch them. The win is latency and focused attention, since each call reasons about less. Voting assigns every call the same task and reduces the outputs to one answer, by majority, by any-flag, or by a vote threshold you tune. The win is confidence and controllable precision or recall: screening content for a policy violation with three prompts and flagging if any one trips raises recall at the cost of false positives; requiring two of three raises precision. Choosing the threshold is a direct false-positive versus false-negative trade, the same lever you tune in a classifier.

### Why gates matter in a chain

A prompt chain multiplies per-step error. If each of four steps is 90% reliable and errors pass downstream unchecked, the chain is roughly 0.9^4, about 66% end to end. A gate between steps that rejects a bad intermediate and retries, or routes to a fallback, breaks that multiplication by catching the error before it compounds. This is why Anthropic draws the gate explicitly in the chaining diagram: the gate, not the extra model call, is what makes a longer chain reliable rather than more fragile.

### Patterns compose

These are not mutually exclusive. A real system routes first, then runs a prompt chain inside the branch for complex inputs, with an evaluator-optimizer loop on the final generation step and parallel voting on a safety screen. The skill is composing the minimum set, each justified by a failure you actually observed, rather than assembling an elaborate graph up front. Anthropic's framing is explicit: start simple, measure where it breaks, and add the one pattern that addresses the break.

### Source

The five patterns, the sectioning and voting split, the augmented-LLM building block, and the simplest-solution-first guidance are from Anthropic, "Building effective agents" (Dec 2024). The orchestrator-workers point that subtasks are decided at runtime, not predefined, is the paper's stated distinction from parallelization. These patterns are stable vocabulary as of 2026, though framework names around them keep changing, so re-check tooling claims.
