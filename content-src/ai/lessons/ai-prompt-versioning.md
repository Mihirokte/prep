---
id: ai-prompt-versioning
chapter: ai-production
title: Shipping prompt changes safely
minutes: 7
---
A prompt is production code: it determines system behaviour, it breaks things when changed, and it needs the same discipline as any other deploy. Teams that edit a prompt in a text box and push it live are shipping an untested behaviour change to every user at once. The safe pattern treats a prompt as a versioned artifact and gates its release behind evals and a staged rollout. Interviewers ask this to separate people who think of prompts as config from people who have been burned by a one-word prompt edit that quietly tanked a metric.

## Prompts as artifacts

The first move is to pull the prompt out of the code and the text box and into a versioned store, so that every prompt has an id and a version, every production response records which prompt version produced it, and a change is a reviewable diff, not an invisible edit. This is what makes everything else possible: you cannot roll back, A/B test, or attribute a regression to a prompt you did not version.

> **Key idea.** If you cannot name the exact prompt version that produced a given production answer, you cannot debug, roll back, or evaluate prompt changes. Versioning is the precondition for everything else in this lesson.

## The two-gate rollout

Shipping a prompt change combines the two eval modes into a pipeline.

```steps
Offline gate | Run the new prompt against golden and regression sets to catch obvious breakage cheaply
Shadow | Run the new prompt on live traffic in parallel, serving the old one, and compare
Canary | Serve the new prompt to a small traffic slice and watch the live metric
A/B | Split traffic and decide on a metric that reflects real value, not a proxy
Promote | Roll out fully, keeping the old version pinned for instant rollback
```

The offline set is a cheap pre-filter: it catches regressions before you spend any live traffic. But offline sets cannot capture the full production input distribution, so the real rollout decision is gated on a live metric. This echoes Huyen's point that there is no single solution to evaluation, the offline set is necessary but not sufficient, and the online signal is where you make the call.

## Shadow, canary, A/B

These are three distinct staging techniques, and naming the difference is a quick credibility signal.

| Technique | Who sees the new prompt | What it measures | Risk to users |
|---|---|---|---|
| Shadow | nobody, runs in parallel | output diff vs old, offline-scored | none |
| Canary | a small percentage | live metric on a slice | bounded to the slice |
| A/B | a controlled split | metric difference with significance | bounded, measured |

Shadow mode is the safest because users never see the new output, you only compare it. Canary bounds the blast radius to a small slice so a bad prompt harms few users and is caught fast. A/B is the statistical decision: enough traffic on each arm to tell a real metric difference from noise.

## Choosing the gate metric

The rollout stands or falls on the metric you gate it on. Pick one that reflects real value, task success rate, edit rate, thumbs-down rate, resolution without escalation, not a convenient proxy like response length or a raw judge score. The classic failure is gating on a proxy that improves while the real outcome gets worse: a prompt that makes answers longer can raise a looks-thorough proxy while lowering actual task success.

```flow
dir: LR
dev: Prompt change | actor
off: Offline eval | gate
shadow: Shadow run | gate
canary: Canary slice | gate
ab: A/B metric | gate
prod: Full rollout | step
dev -> off : new version
off -> shadow : passes
shadow -> canary : no diff regression
canary -> ab : slice healthy
ab -> prod : metric wins
ab --> dev : metric loses, roll back
```

## Rollback and attribution

Because every response records its prompt version, rollback is pinning the previous version, instant and total, and attribution is a group-by on version. When a metric moves, you can line it up against the prompt-version timeline and see whether the move followed a change. Without versioning, a regression that appeared three deploys ago is nearly impossible to localise.

```recall
Q: Why can you not safely ship a prompt change on an offline eval pass alone?
A: Offline sets cannot capture the full production input distribution, so a change that passes offline can still regress a live metric. The real rollout decision is gated on an online metric.
Q: What is the difference between shadow mode and a canary?
A: Shadow runs the new prompt in parallel without serving its output, so users never see it and you only compare. A canary serves the new prompt to a small traffic slice, bounding real user exposure.
Q: Why gate on task success rate rather than response length or a raw judge score?
A: Proxies can improve while the real outcome worsens, for example longer answers that lower actual task success. The gate must reflect real value or it rewards the wrong behaviour.
Q: What does recording the prompt version on every response make possible?
A: Instant rollback by pinning the prior version, and attribution of a metric change to a specific prompt by grouping responses on version. Both are impossible without it.
Q: Why treat a prompt edit as a reviewable diff instead of a text-box change?
A: A prompt is behaviour-defining code, so an invisible edit is an untested change pushed to all users. A diff gets review, a version, and a rollback path, the same safety any code deploy has.
```

===DEEPER===

### Why a one-word edit is dangerous

Prompt behaviour is not continuous in the prompt text. Adding a single instruction, reordering two sentences, or changing be concise to be brief can shift outputs in ways that are invisible on a handful of examples but material across the real distribution. This is why the eyeball test, try it on three inputs, looks fine, ship, fails: three inputs cannot reveal a change that regresses two percent of a long-tail slice. The discipline that catches it is the same offline-then-online pipeline used for model changes, because a prompt change is a behaviour change of the same kind, just cheaper to make, which is exactly what makes it tempting to ship carelessly.

### Decoupling prompt releases from code releases

A mature setup lets prompts ship on their own cadence, pulled at runtime from the versioned store rather than baked into the application binary. This is powerful and risky. The upside is fast iteration and instant rollback without a code deploy. The downside is that a prompt is now an external input your running system trusts, so the store needs the same access control, review, and audit as code, and the runtime needs a safe default if the fetch fails. Treat the prompt store as part of your deploy surface, not as config, and version-pin what production reads so a change is deliberate, never a surprise fetch.

### A/B significance, briefly

Deciding an A/B needs enough traffic that the metric difference is distinguishable from noise, the same binomial-confidence reasoning as eval dataset sizing. A one-point lift in task success on a few hundred requests per arm is inside the error bar and not a result. Run the test until the interval around the difference excludes zero, or accept you cannot distinguish the arms and keep the simpler prompt. Peeking at the metric and stopping the moment it looks good inflates false positives, so fix the sample size or use a sequential test designed for repeated looks, do not eyeball the running number and call it when it is ahead.

### What to version alongside the prompt

The prompt text alone is not the whole behaviour. Version the model and parameters (temperature, max tokens), the tool schemas, and the retrieval configuration together, because the same prompt against a different model or a different retriever is a different system. The cleanest unit is a named configuration bundle, prompt plus model plus parameters plus tool and retrieval settings, versioned as one artifact and pinned per deploy. That way a response's recorded version identifies the entire behaviour that produced it, not just the words, which is what makes attribution and rollback actually reliable (as of 2026, re-check your prompt-management tooling for bundle-level versioning).
