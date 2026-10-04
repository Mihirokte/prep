---
id: ai-fine-tune-vs-prompt
chapter: ai-production
title: Fine-tune or prompt
minutes: 7
---
The most common senior mistake is reaching for fine-tuning first. The decision order is prompting, then retrieval, then fine-tuning, and most teams never need the last step. Interviewers ask this to see whether you can separate the three things fine-tuning actually changes, behaviour and format and latency, from the one thing it does not, which is giving the model new facts. If you say fine-tuning to add knowledge, you have failed the question.

## The decision order

```steps
Prompt | Exhaust prompting with structured outputs and few-shot examples first
Retrieve | Add RAG when the model needs facts it does not have
Fine-tune | Only when prompting plus retrieval provably cannot hit the bar
```

The order is not arbitrary. Prompting is instant to iterate and costs nothing to change. Retrieval handles private, large, or changing facts without touching the model. Fine-tuning is the slowest to iterate, creates an artifact you must host and re-train, and is the only step that cannot add fresh knowledge. So you climb the ladder only when the cheaper rung demonstrably fails.

## What fine-tuning actually changes

| Need | Right tool |
|---|---|
| New or changing facts | Retrieval, not fine-tuning |
| A consistent format or style | Fine-tuning can help |
| A narrow task at high volume, low latency | Fine-tuning can help |
| A behaviour prompting cannot reach | Fine-tuning, with evals to prove it |

Fine-tuning adjusts weights, so it teaches behaviour, tone, and output shape. It does not reliably store facts you can trust to be current, and anything it did memorize goes stale and cannot be updated without re-training. Facts belong in retrieval.

## Why fine-tuning is often a last resort

Two forces push it down the list. First, operational cost: a fine-tuned model is an artifact you host, version, monitor, and re-train. Second, base-model drift: frontier base models improve fast, and a checkpoint you tuned six months ago can end up worse than the next base release, leaving you locked to a model you now have to maintain just to keep your tuned behaviour. Chip Huyen's guidance is blunt: fine-tuning is often a last resort and many teams never do it. OpenAI's stated order reinforces it, get evaluations in place first, because you cannot rationally decide to fine-tune without the eval infrastructure to prove it helped.

> **Rule of thumb.** If you cannot measure the gap with an eval, you are not ready to fine-tune. The eval is the thing that tells you prompting plus retrieval has actually run out of road.

## A worked decision

A team wants to classify 500k support tickets per month into 40 fixed categories, with tight latency and cost limits.

```flow
dir: TB
start: 500k tickets month | actor
prompt: Prompt plus few-shot | model
evalg: Hits accuracy bar | gate
ship: Ship prompted | step
ft: Fine-tune small model | model
start -> prompt : classify
prompt -> evalg : measure
evalg -> ship : yes
evalg -> ft : no
ft -> ship : cheaper per call
```

The memo must first prove prompting-only cannot hit the accuracy bar. If it can, ship it, no fine-tuning. If it cannot, fine-tuning a small model is attractive here precisely because the task is narrow, the taxonomy is fixed, and the volume makes a cheaper per-call model pay back the training and hosting cost. This is the shape of case where fine-tuning wins: high volume, fixed taxonomy, latency and cost pressure, and a proven prompting ceiling.

## Failure modes

- Fine-tuning to add knowledge: the facts go stale and were never reliable.
- No eval: you cannot tell whether the tuned model is better or worse.
- Locking to a checkpoint: a later base model beats your tuned one and you keep maintaining it.
- Tuning before exhausting prompting: you pay the artifact cost for a gain a better prompt would have given free.

> **Interview.** State the order, name the one thing fine-tuning cannot do (add trustworthy fresh facts), and require evals before tuning. Then give the case where it wins: narrow task, fixed output space, high volume, proven prompting ceiling.

```recall
Q: Why is retrieval, not fine-tuning, the answer when the model needs new facts?
A: Fine-tuning adjusts weights and teaches behaviour and format, but any facts it memorizes are unreliable and go stale with no way to update short of re-training. Retrieval supplies current facts without touching the model.
Q: What makes base-model drift a reason to avoid fine-tuning?
A: Frontier base models improve quickly, so a checkpoint you tuned can fall behind the next base release, locking you to maintaining a model that is now worse than the stock option.
Q: Why must evals come before any fine-tuning decision?
A: Without an eval you cannot measure whether prompting plus retrieval has actually failed, nor whether the tuned model is better. The eval is what justifies climbing to the expensive rung.
Q: Describe a task where fine-tuning genuinely wins.
A: A narrow, fixed-taxonomy task at high volume with latency and cost pressure, where prompting has provably hit its ceiling, so a cheaper fine-tuned small model pays back its training and hosting cost.
```

===DEEPER===

## Cost accounting for the ladder

Each rung has a different cost shape. Prompting cost is per-request input and output tokens, with iteration cost near zero. Retrieval adds an embedding and index cost plus the per-request tokens of the retrieved context, and its iteration cost is re-indexing. Fine-tuning adds a one-time training cost, a per-token (often lower) inference cost on the tuned model, and a recurring maintenance cost: re-training as base models move, plus hosting and monitoring an artifact. The 500k-ticket case pays back only because the recurring per-call saving, multiplied by the volume, exceeds the training plus maintenance cost. Below some volume threshold, a well-prompted frontier model is cheaper all-in despite its higher per-call price, because you pay no artifact cost.

## When fine-tuning beats a long prompt

Fine-tuning can fold a long instruction-and-examples prompt into the weights, cutting per-request input tokens. For a narrow task answered millions of times, moving 2k tokens of few-shot examples out of every prompt and into the model can dominate the economics, and the tuned small model may also beat the latency of a prompted frontier model. This is a format-and-latency win, not a knowledge win: the tuned model learns the mapping, not new facts about the world. Pair it with retrieval if the task also needs current data.

## Data and the eval gate

Fine-tuning needs clean, representative, correctly-labelled examples, and quality beats quantity: a few hundred high-quality examples often beat thousands of noisy ones, and label noise teaches the wrong mapping directly. Before tuning, freeze an eval set drawn from real traffic and never used in training, so you can compare prompted-baseline against tuned-model on the same bar. After tuning, check not only task accuracy but regressions on adjacent behaviours, since tuning on a narrow distribution can degrade general capability. The eval gate is what turns fine-tuning from a hunch into a decision you can defend. See the fine-tuning methods lesson for how SFT, LoRA, and preference optimization actually implement the training step.
