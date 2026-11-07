---
id: ops-debugging-production
chapter: ops-observability
title: Debugging production systematically
minutes: 3
---
Production debugging is a search over hypotheses, not a tour of dashboards. The goal is to narrow the failing cohort, identify the first bad component, and confirm causality with the safest available experiment. A plausible correlation is not yet a root cause.

## Stabilize then investigate

First decide whether customers need mitigation now. Roll back, disable a feature, shed optional work, add safe capacity, or route around a failing dependency when impact is material. Preserve evidence, but do not keep users broken to obtain a perfect diagnosis.

```steps
Confirm | Verify the alert and customer-visible symptom
Scope | Split by version region endpoint tenant and dependency
Mitigate | Reduce impact with the safest reversible action
Compare | Contrast healthy and failing requests or hosts
Test | Change one suspected cause or reproduce it safely
Verify | Require recovery in both technical and business signals
```

```check
Q: Following a canary release of a new checkout feature, user checkout errors spike immediately in the canary region while the baseline region remains healthy. What is the recommended first action for the on-call engineer to take?
- Immediately restart the container fleet across all regions to clear corrupted process state.
* Roll back the feature deployment or safely disable the toggle for the affected cohort.
- Turn on verbose debug logging across all production clusters to capture internal stack traces.
- Analyze cross-region infrastructure utilization graphs to determine if hardware is failing.
Why: The primary priority is to stabilize the system and protect customers using the safest reversible mitigation, such as rolling back or disabling the feature. Restarting instances or turning on verbose debug logging can hide root causes or overload a struggling system while keeping users broken.
```

## Work differentially

Compare what is slow with what is not. If only the new version fails, inspect code and configuration differences. If one region fails across versions, inspect regional dependencies and capacity. If p50 is stable but p99 grows, look for contention, queueing, retries, pauses, or a slow downstream cohort rather than general compute shortage.

Start at the user-facing SLI, then follow a trace to the span where time or errors appear. At that component, inspect its saturation signal: CPU throttling, memory pressure, garbage-collection pause, connection-pool wait, lock wait, queue age, disk latency, or downstream timeout.

```flow
dir: LR
sli: Customer SLI | gate
trace: Slow trace | step
span: First wide span | step
resource: Resource signal | step
change: Recent change | step
test: Reversible test | gate
sli -> trace
trace -> span
span -> resource
resource -> change
change -> test
```

## Avoid common traps

Do not restart first unless restart is the approved mitigation; it destroys state and can hide the cause. Do not blame the latest deployment merely because times align. Do not average away the problem: aggregate CPU can look healthy while one shard or tenant is saturated. Do not run unbounded queries or verbose logging against an already overloaded service.

## Confirm the cause

A root cause explains the mechanism and the evidence. Strong confirmation comes from reversing the change, reproducing the failure, isolating the cohort, or observing the predicted recovery after a targeted fix. Close with a detection or prevention improvement: test, guardrail, alert, capacity policy, or simpler design.

```recall
Q: Why begin from the customer SLI rather than random infrastructure graphs?
A: It anchors the investigation to the actual failure and lets traces lead to the first component where the symptom appears.
Q: What does stable p50 with worse p99 suggest?
A: A slow cohort caused by contention, queueing, retries, pauses, or one dependency, rather than uniform slowdown.
Q: Why is correlation with a deployment insufficient?
A: Timing suggests a hypothesis but does not show the mechanism; isolation, reversal, or reproduction is needed to confirm causality.
Q: What should follow mitigation and diagnosis?
A: A prevention or detection change that makes the same class of failure less likely or faster to contain.
```
