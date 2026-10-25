---
id: scratch-14-52-design-success-metrics
chapter: scratch-14-agent-engineering
title: Design Success Metrics Before the Result Exists
minutes: 0
---
> Measurement should answer a decision, not decorate a dashboard. Start with the goal, derive questions, then choose the smallest metrics that answer them.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 14 lessons 47 and 51
**Time:** ~70 minutes

## Learning Objectives

- Derive questions and metrics from an outcome goal.
- Define thresholds, windows, sources, and directions before observing results.
- Pair outcome metrics with guardrails and counter-metrics.
- Match evaluation evidence to the decision the build must support.

## Goal, Question, Metric

Start with a goal:

> Reduce time to identify the affected service without increasing unsafe actions.

Derive questions:

- How quickly is the correct service identified?
- How often is the identified service correct?
- Does diagnosis remain read-only?
- Does the workflow increase alert dismissal or operator workload?

Then choose metrics that operationalize those questions.
```flow
dir: LR
G: Goal | step
Q1: Question about outcome | step
Q2: Question about risk | step
M1: Outcome metric | step
M2: Guardrail metric | step
D: Decision rule | step
G -> Q1
G -> Q2
Q1 -> M1
Q2 -> M2
M1 -> D
M2 -> D
```

## A Metric Needs a Contract

Every metric needs:

| Field | Example |
|---|---|
| Name | `median_identification_seconds` |
| Direction | at most |
| Threshold | 120 |
| Window | ten incident replays |
| Source | replay event log |
| Population | on-call engineers in the pilot |
| Kind | outcome or guardrail |

Without source and window, a number cannot be reproduced. Without a threshold, it cannot drive a decision.

## Outcome, Guardrail, and Counter-Metric

- **Outcome metric:** did the desired state improve?
- **Guardrail:** did a fixed constraint remain true?
- **Counter-metric:** did the local improvement shift cost or harm elsewhere?

For an incident workflow, speed is not enough. Correctness, production writes, operator workload, and missed alerts protect against a fast but unsafe result.

## Offline and Online Evidence

Offline replay is useful for repeatability and edge coverage. A bounded pilot is useful for real behavior, trust, and workflow effects. Neither substitutes for the other.

Use the cheapest evidence that can answer the current decision. Do not expose real users merely because the implementation is ready.

## Decide Before You Measure

Write the pass, fail, and ambiguous paths before seeing results. Otherwise the team will move the threshold to protect the build.

Example:

- pass: correct service rate at least 0.9 and median time at most 120 seconds;
- fail: any production write or correct rate below 0.75;
- ambiguous: small improvement with wide variance, requiring a larger replay set.

## Build It

The lab validates a measurement plan, evaluates inclusive thresholds, records missing values, and writes `outputs/measurement-report.json`.
```bash
python3 code/main.py
python3 -m unittest discover code/tests -v
```
Remove the guardrail metric and observe why the plan becomes invalid even when the outcome metrics remain.

## What You Keep

Keep `outputs/measurement-report.json`. It defines the evidence gate for the prototype, pilot, or production stage.

Source: [AI Engineering from Scratch, phase 14, 52-design-success-metrics](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/52-design-success-metrics), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What is the correct measurement order?
A: Goal, question, metric. Goals define information needs, questions refine them, and metrics operationalize answers.
Q: Why define thresholds before looking at the results?
A: To prevent moving the decision rule to protect the build. Precommitted thresholds reduce post-result rationalization.
Q: What does a guardrail metric protect?
A: A fixed constraint or unacceptable harm. Guardrails ensure improvement does not violate safety or policy.
Q: What is a counter-metric?
A: A measure that catches cost or harm shifted elsewhere. Local gains can create downstream burden that a counter-metric exposes.
Q: Why must a metric name its source and window?
A: For reproducibility and interpretation. A number without provenance and time or sample boundaries cannot support a reliable decision.
Q: When is offline replay insufficient?
A: When the decision depends on real user behavior or workflow effects. Replay is repeatable but cannot fully reproduce trust, coordination, and live behavior.
```

===DEEPER===
## Exercises

1. Derive three questions from one outcome goal.
2. Add a counter-metric that catches cost shifted to another role.
3. Define the source, population, and window for every metric.
4. Write pass, fail, and ambiguous decisions before generating values.
5. Identify one metric that is easy to collect but cannot change the decision. Remove it.

## Further Reading

- [Basili, Software Modeling and Measurement: The Goal/Question/Metric Paradigm](https://drum.lib.umd.edu/items/8119803a-362b-42ec-b6ce-2311713e7236), for deriving operational measurements from explicit goals.
- [Basili, Caldiera, and Rombach, The Goal Question Metric Approach](https://www.cs.toronto.edu/~sme/CSC444F/handouts/GQM-paper.pdf), for applying the method as a feedback and improvement system.
