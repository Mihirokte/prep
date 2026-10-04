---
id: ai-role
chapter: ai-patterns
title: What an AI engineer does
minutes: 7
---
AI engineering is building products on top of foundation models you call through an API, not training models from scratch. The clearest framing comes from Chip Huyen (AI Engineering, O'Reilly 2025): ML engineering starts with the model; AI engineering starts with the product. Interviewers lean on this because the role is new enough that candidates often describe the wrong job, either classical ML or pure prompting.

## The job, versus ML engineer and data scientist

Classical ML engineering is a slow, model-first loop: collect and label data, choose features, train, evaluate, deploy, with the engineer deep in model internals. A data scientist leans toward analysis, experimentation, and statistical inference. AI engineering starts from a product idea and uses an existing frontier model from day one, reaching for data collection or custom training much later, if ever.

| Dimension | ML engineer | AI engineer |
|---|---|---|
| Starting point | A model to train | A product to ship |
| Data | Labelled training sets | Few examples, eval sets, retrieval corpora |
| Core artifact | Trained weights | Prompts, retrieval, tools, evals |
| Main difficulty | Training and feature quality | Evaluation and system design |
| Custom training | The default | A last resort |

The barrier to entry is low (anyone can call an API) but the barrier to doing it well is high, and the hard part is evaluation, not the API call.

## The skill stack

```steps
Prompting | Write prompts that hold up under varied input, with structure and examples
Context and retrieval | Get the right information into the window: RAG, chunking, reranking
Tools and agents | Let the model act: tool schemas, the agent loop, stop conditions
Evaluation | Build eval sets and judges so you can measure quality and catch regressions
Cost and latency | Size models, cache prompts, route and batch to hit budgets
Safety | Guardrails, prompt-injection defense, human-in-the-loop for risky actions
```

Notice what is not on it: training loops, feature engineering, and gradient-level model internals. Those belong to ML engineering. An AI engineer needs enough mechanism (tokens, attention, sampling) to reason about cost and failure, not to train.

```flow
dir: LR
model: Foundation model | model
ctx: Context + retrieval | store
tools: Tools | tool
app: Your product | step
eval: Evals | gate
model -> app : capability
ctx -> app : grounding
tools -> app : actions
app -> eval : measured
eval -> app : regression gate
```

## The eval-first build loop

The defining practice of the role is building the measurement before and alongside the feature, not after. The loop:

```steps
Define success | Write representative inputs and known-good outputs or a grading rubric
Build the thinnest version | Simplest prompt or pipeline that could work
Measure | Score it on the eval set, record quality, latency, cost
Find the worst failure | Read the failures, not just the aggregate score
Change one thing | Prompt, retrieval, model, or tool, then re-measure
Gate | Keep the eval in CI so changes cannot silently regress
```

> **Key idea.** Evaluation is the skill that separates a demo from a product. A model will produce something plausible for any input; only an eval tells you whether it is right often enough to ship.

> **Pitfall.** Shipping on vibes, a few manual tries that looked good, then discovering in production that it fails on a common slice you never tested. Build the eval set first.

## Fine-tuning is a last resort

The decision order is prompt, then retrieval, then fine-tune. Prompting and retrieval are fast, cheap, and reversible; fine-tuning needs data, costs money and time, and ties you to a model version. Many strong teams never fine-tune. Reach for it only when prompting and retrieval have provably plateaued and you have the data to justify it (see the fine-tune-or-prompt lesson).

## What interviewers probe

Expect system-design questions far more than algorithm puzzles: design an eval suite for X, design a RAG pipeline for Y, cut cost and latency for Z, design guardrails for an agent that can run code. They are checking that you clarify requirements, reason about trade-offs, measure with evals, and account for cost, latency, and failure, not that you can recite model names. The design chapter of this course is built around exactly these.

```recall
Q: In one line, how does AI engineering differ from ML engineering?
A: ML engineering starts with the model (train, then find a use); AI engineering starts with the product and calls an existing foundation model, training only as a last resort.
Q: Why is evaluation called the hard part of the role?
A: A model yields something plausible for any input, so without an eval you cannot tell whether it is right often enough to ship or whether a change helped or regressed.
Q: What is the standard decision order before fine-tuning, and why?
A: Prompt, then retrieval, then fine-tune. The earlier options are cheaper, faster, and reversible; fine-tuning needs data and cost and pins you to a model version.
Q: What kind of interview question should you expect, and what are they checking?
A: System-design questions (eval suite, RAG pipeline, cost/latency, guardrails). They check requirement clarification, trade-off reasoning, eval-driven thinking, and cost and failure awareness.
```

===DEEPER===

### Why the role appeared when it did

Before capable instruction-following foundation models were available by API, using ML in a product meant training or heavily adapting a model, an ML-engineer job. Once a single API call could do classification, extraction, summarisation, and open-ended generation at useful quality, the bottleneck moved from training to everything around the model: getting the right context in, making it act safely, and knowing whether the output is good. That cluster of concerns is AI engineering. Huyen's framing (AI Engineering, 2025) names the inversion precisely: the product, not the model, is now the starting point.

### The eval-first loop as a discipline, not a phase

Teams that treat evaluation as a final QA step keep getting surprised in production, because the aggregate score hides the slice that breaks and the demo cases are not the hard cases. Teams that build the eval set alongside the first prototype get three things: a definition of done, a regression gate in CI, and a worst-failures list that tells them what to fix next. The rest of this course operationalises that loop, prompts and structured outputs for reliable building blocks, retrieval and reranking for grounding, agents for action, and the production chapter for evals, observability, and shipping changes behind eval gates. The through-line is the same: measure, then change one thing, then measure again.
