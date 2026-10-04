---
id: ai-interview-framework
chapter: ai-design
title: A framework for AI design questions
minutes: 8
---
AI design questions are open-ended on purpose, and interviewers are grading your process more than your final diagram. A repeatable framework keeps you from jumping to an architecture before you understand the problem, which is the single most common failure. The order is clarify, data, model, architecture, eval, cost and latency, risks. This lesson gives a checklist for each step and a short worked example so the structure is concrete.

## The seven steps

```steps
Clarify | Pin scope, stakes, volume, latency, and what must not be automated
Data | What knowledge, where it lives, how it changes, who may see it
Model | Capability tier, context size, the latency price quality triangle
Architecture | The request path: retrieval, generation, tools, gates
Eval | How you measure quality per stage, before and after launch
Cost and latency | Per-request budget and the levers to hit it
Risks | Failure modes, guardrails, and human checkpoints
```

Do them roughly in order, but loop back: a cost constraint can change the model, a risk can change the architecture. The discipline is to not skip clarify and data, which is where weak candidates lose the most points.

## Clarify

State the problem back and ask the questions that change the design: read-only or action-taking, stakes of a wrong answer, volume and latency expectations, and what must stay human. Narrow the scope explicitly; a smaller well-defined system beats a vague ambitious one.

## Data

Most AI systems live or die on data. Ask what knowledge the system needs, whether it is private, large, or changing, how fresh it must be, and who is allowed to see what. The answers decide retrieval versus fine-tuning versus long context, and surface permissions and freshness constraints early.

## Model

Pick a capability tier, not a brand. Reasoning task, or simple extraction? Does it need a large context? Then place it on the latency, price, quality triangle: you optimize two at the expense of the third. Say you would select by eval, not by leaderboard, and would wire a fallback.

## Architecture

Draw the request path.

```flow
dir: LR
user: User | actor
guard: Input gate | gate
retr: Retrieve | store
model: Generate | model
check: Output gate | gate
user -> guard : request
guard -> retr : query
retr -> model : context
model -> check : draft
check -> user : response
```

Keep components swappable and name why each exists. Gates bracket the model; retrieval grounds it; tools let it act. Prefer the simplest shape that meets the bar: a workflow before an agent, prompting before fine-tuning.

## Eval, cost and latency, risks

- Eval: name the metric per stage (recall@k for retrieval, faithfulness for generation, task accuracy end to end) and say you gate releases on them. Evals come first, not last.
- Cost and latency: give a per-request budget, split it, and name the lever per stage (caching, routing, smaller model, streaming).
- Risks: list concrete failure modes (hallucination, injection, stale data, runaway cost) and the guardrail or human checkpoint for each.

> **Pitfall.** Drawing boxes before clarifying scope and data. An architecture that answers the wrong problem, however elegant, fails the question.

## A worked mini-example

Prompt: design a system to answer policy questions for employees.

- Clarify: read-only Q&A, internal, moderate volume, must respect per-department access, must not guess.
- Data: HR policy docs, changing, access-controlled, freshness matters.
- Model: a mid-tier model is enough for grounded Q&A; large context not required if retrieval is good.
- Architecture: RAG with permission-filtered retrieval, grounded generation with citations, an output gate that refuses when unsupported.
- Eval: recall@k on policy-question pairs, faithfulness and citation correctness, sampled human review.
- Cost and latency: cache the system prompt, keep context tight, stream the answer.
- Risks: stale policy (track content age), unauthorized access (filter retrieval by department), hallucination (require citations, refuse if unsupported).

That is a complete answer in seven moves, each tied to the clarifying facts.

> **Interview.** Announce the framework, spend real time on clarify and data, keep the architecture the simplest thing that meets the bar, put evals before the build, and close with concrete risks and their guardrails. The structure itself is most of the score.

```recall
Q: What is the most common failure in an AI design interview?
A: Jumping to an architecture before clarifying scope and understanding the data. An elegant system that answers the wrong problem fails the question.
Q: Why do data questions come so early in the framework?
A: Most AI systems live or die on data. Whether knowledge is private, large, changing, and who may see it decides retrieval versus fine-tuning versus long context and surfaces permissions and freshness up front.
Q: What does placing a model on the latency, price, quality triangle mean in practice?
A: You cannot maximize all three. You pick a capability tier for the task and accept a trade: a faster cheaper model may cost quality, a higher-quality one costs latency or price. Select by eval, not leaderboard.
Q: Why should evals be discussed before the build, not after?
A: Evals define what good means and gate releases against regression. Without them you cannot tell whether an architecture or a later change actually works, so they come first in the design, not as an afterthought.
Q: How do you keep an architecture answer from over-engineering?
A: Prefer the simplest shape that meets the bar: a workflow before an agent, prompting before fine-tuning, retrieval before long context. Add complexity only when a named requirement forces it.
```

===DEEPER===

## Looping, not marching

The seven steps are an order to open with, not a strict sequence. Real design is iterative: you reach the cost step and find the frontier model you chose blows the per-request budget, so you loop back to the model step and add a router, which changes the architecture to put a classifier in front. Or the risk step surfaces prompt injection on retrieved content, which pushes you back to architecture to isolate untrusted text and add an output gate. Signal this to the interviewer explicitly, say I am going back to the model choice because the cost budget just ruled out the frontier model everywhere, because it shows you understand the trade-offs connect rather than sit in separate boxes. A candidate who marches through the steps once and never revisits looks like they memorized a list; one who loops looks like they design.

## Making trade-offs out loud

The highest-signal thing you can do is reason about alternatives before committing. For each major choice, name the option you picked, the one you rejected, and why. RAG over long context here because the knowledge is large and changing and permissions matter. A workflow over an agent because the task is a fixed sequence and the loop would only add cost and failure modes. Prompting over fine-tuning because we have no evals yet and the base model may be enough. This is exactly what the stack-judgment and agents-versus-workflows lessons teach, applied live. The interviewer is listening for whether you can defend a decision against its alternative, not whether you landed on their preferred answer.

## Scoping to the time you have

A design question is time-boxed, so manage depth. Open with the full framework at a sentence each so the interviewer sees the whole shape, then go deep where they steer or where the problem is hardest, usually retrieval quality, the eval strategy, or the risk and guardrail layer. Explicitly defer the parts that are standard, I will assume a standard observability and tracing setup unless you want to dig in, so you spend the time on what differentiates a strong answer. Close by restating the design in three or four sentences and naming the one risk you are most worried about, which leaves the interviewer with a crisp summary rather than a half-finished diagram.
