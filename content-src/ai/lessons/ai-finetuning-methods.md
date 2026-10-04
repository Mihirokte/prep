---
id: ai-finetuning-methods
chapter: ai-production
title: Fine-tuning methods
minutes: 8
---
Once the decision to fine-tune is justified, the next question is which method. The space splits into teaching a mapping from labelled examples (supervised fine-tuning), doing it cheaply (LoRA and QLoRA), aligning to preferences (DPO and RLHF), and shrinking a model to imitate a bigger one (distillation). Interviewers probe this to see if you know what each method changes, what data it needs, and the traps: catastrophic forgetting, over-fitting a small set, and evaluating a tuned model honestly.

## Supervised fine-tuning

SFT trains the model on input-output pairs so it learns the mapping you want: given this kind of input, produce this kind of output. It is the workhorse for format, style, and narrow-task behaviour. The data is the product: a few hundred clean, representative, correctly-labelled examples usually beat thousands of noisy ones, because label noise teaches the wrong mapping directly.

```steps
Collect | Gather clean input-output pairs that represent real traffic
Split | Hold out an eval set never seen during training
Train | Minimize next-token loss on the target outputs
Evaluate | Compare against the prompted baseline on the held-out set
```

## LoRA and QLoRA

Full fine-tuning updates every weight, which is expensive to train and produces a full-size artifact per task. LoRA (Low-Rank Adaptation, Hu et al., 2021) freezes the base weights and injects small trainable low-rank matrices into each layer, so you train and store only those adapters. The paper reports that for GPT-3 175B, LoRA cuts trainable parameters by about 10,000x and GPU memory by about 3x versus full fine-tuning, with no inference latency when the adapter is merged.

QLoRA (Dettmers et al., 2023) goes further: it quantizes the frozen base to 4-bit and back-propagates through it into LoRA adapters, letting you fine-tune a 65B model on a single 48GB GPU while preserving full 16-bit task performance.

```bars
title: LoRA vs full fine-tuning on GPT-3 175B (paper figures)
unit: x reduction
Trainable parameters | 10000
GPU memory | 3
```

Because adapters are small, you can keep many per base model and swap or even serve several at once, which is the serving story at the end of this lesson.

## Preference optimization

SFT teaches what a good answer looks like from examples. Preference optimization teaches which of two answers is better, from pairwise human (or model) comparisons, to align tone, helpfulness, and safety.

- RLHF trains a separate reward model on preference pairs, then optimizes the policy against it with reinforcement learning (typically PPO). Powerful, but a multi-stage pipeline that is hard to tune and unstable.
- DPO (Direct Preference Optimization, Rafailov et al., 2023) skips the separate reward model and the RL loop: it reparameterizes the problem so a simple classification loss on preference pairs recovers the optimal policy in closed form. The paper reports it aligns as well as or better than RLHF while being substantially simpler to implement and train.

```flow
dir: LR
pairs: Preference pairs | store
rlhf: Reward model plus RL | model
dpo: DPO classify loss | model
policy: Aligned model | model
pairs -> rlhf : two stage
pairs -> dpo : one stage
rlhf -> policy : PPO
dpo -> policy : closed form
```

## Distillation

Distillation trains a small student model to imitate a large teacher on your task distribution, using the teacher's outputs (or output distributions) as targets. It is how you turn an expensive frontier model that works into a cheap small model that is almost as good on your narrow slice. It needs production data and stable evals, so it comes last.

## Trade-offs

| Method | Teaches | Data | Main risk |
|---|---|---|---|
| SFT | A mapping | Labelled pairs | Over-fit a small set |
| LoRA / QLoRA | Same, cheaply | Labelled pairs | Rank too low to fit the task |
| RLHF | Preferences | Pairwise comparisons | Unstable, costly pipeline |
| DPO | Preferences | Pairwise comparisons | Needs good preference data |
| Distillation | Imitate a teacher | Teacher outputs | Student ceiling below teacher |

## Failure modes

- Catastrophic forgetting: tuning hard on a narrow distribution degrades general ability the model used to have.
- Over-fitting: a tiny or unrepresentative set memorizes examples and fails on real inputs.
- Data leakage: eval examples that crept into training inflate the measured gain.
- No regression check: task accuracy rises while adjacent behaviours quietly break.

> **Interview.** Map need to method: format or narrow task is SFT (LoRA or QLoRA to make it cheap), alignment to preferences is DPO before RLHF for simplicity, shrinking a working frontier model is distillation. Then name the traps, forgetting and over-fit and leakage, and insist on a held-out eval plus a regression check.

```recall
Q: What does LoRA freeze and what does it train, and why does that help?
A: It freezes the base weights and trains only small injected low-rank matrices. That cuts trainable parameters and memory dramatically (about 10,000x fewer parameters, 3x less memory on GPT-3 175B) and lets you keep many small adapters per base model.
Q: How does DPO avoid RLHF's reward model and RL loop?
A: It reparameterizes the preference problem so a simple classification loss on preference pairs recovers the optimal policy in closed form, matching or beating RLHF while being much simpler to train.
Q: What is catastrophic forgetting and how do you catch it?
A: Fine-tuning on a narrow distribution can degrade general capability the model previously had. You catch it by evaluating adjacent and general behaviours, not just the target task, before and after tuning.
Q: Why does QLoRA matter for who can fine-tune large models?
A: It quantizes the frozen base to 4-bit and trains LoRA adapters through it, so a 65B model fits fine-tuning on a single 48GB GPU with full 16-bit task performance, bringing large-model tuning within reach of modest hardware.
Q: When is distillation the right method rather than SFT?
A: When you already have a large model that works and want a cheaper small model for a narrow slice. You train the student on the teacher's outputs, which requires production data and stable evals, so it is a late move.
```

===DEEPER===

## The LoRA rank knob

LoRA approximates the weight update as the product of two low-rank matrices of inner dimension r. A larger r gives more capacity to fit the task but more parameters to train and store; too small an r cannot represent the needed update and underfits. A common practice is to start with a small rank (for example 8 or 16) and raise it only if the eval shows the adapter cannot capture the task. LoRA also exposes a scaling factor (often written alpha) that controls how strongly the adapter perturbs the base; it interacts with learning rate and is worth sweeping. Because the base is untouched, LoRA composes cleanly: you can merge the adapter into the weights for zero inference overhead, or keep it separate to swap tasks at serve time.

## Serving adapters

Keeping LoRA adapters separate enables multi-adapter serving: one copy of the frozen base in GPU memory, many small adapters loaded on top, routed per request. This is far cheaper than hosting a full fine-tuned model per task, and serving stacks support batching requests that use different adapters against the shared base. If instead you merge the adapter into the base, you get a single standalone model with no per-request adapter overhead but lose the swap-ability. The choice is between many-tasks-one-base (keep adapters separate) and one-task-maximum-speed (merge).

## Evaluating a tuned model

Treat evaluation as the gate, not an afterthought. Freeze a held-out set from real traffic before training and keep it out of the training data, or the measured gain is leakage. Report the prompted baseline and the tuned model on the same set so the comparison is honest. Beyond the target metric, run a regression suite on general and adjacent behaviours to catch catastrophic forgetting, and check calibration and refusal behaviour if the tuning touched safety. For preference-tuned models, pairwise human or judge comparison against the base is more informative than a single scalar score. The fine-tune-or-prompt lesson covers when to climb to this rung at all; this lesson is only about how to climb it once you are there.
