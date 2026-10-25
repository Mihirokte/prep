---
id: scratch-14-50-choose-the-smallest-testable-slice
chapter: scratch-14-agent-engineering
title: Choose the Smallest Slice That Can Change the Decision
minutes: 0
---
> Small is useful only when it proves something important. A tiny build that cannot change the next decision is merely incomplete.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 14 lesson 49
**Time:** ~65 minutes

## Learning Objectives

- Define a slice by the assumptions it proves.
- Balance outcome value, uncertainty reduction, effort, and consequence.
- Prefer reversible evidence over premature production commitment.
- Reject slices that omit the risky part of the workflow.

## Vertical Means Evidence End to End

A useful slice crosses the minimum real workflow needed to observe an outcome. It can be narrow in users, data, duration, and capability. It should not be narrow by removing the exact uncertainty you need to test.

Examples:

- A read-only replay across ten real incidents tests service identification and operator trust.
- A polished dashboard on synthetic data may test comprehension but not data feasibility.
- A production auto-remediator tests everything at once with unacceptable consequence.

## Define Required Proof First

Take the highest-risk open assumptions and turn them into a required proof set. A candidate slice is eligible only if it covers that set.

Then compare eligible slices on:

| Dimension | Direction |
|---|---|
| Outcome value | More is better |
| Uncertainty reduced | More is better |
| Effort | Less is better |
| Consequence | Less is better |
| Reversibility | More is better |

The lab’s score is intentionally simple. The eligibility gate matters more than the arithmetic.
```flow
dir: TB
R: Required proof | step
C1: Candidate slice 1 | step
C2: Candidate slice 2 | step
C3: Candidate slice 3 | step
G: Covers all proof? | gate
X: Reject | step
S: Compare each candidate slice: evidenc... | step
B: Build one slice | step
R -> C1
R -> C2
R -> C3
C1 -> G
C2 -> G
C3 -> G
G -> X : No
G -> S : Yes
S -> B
```

## Common False Minimums

- **The UI-only minimum:** removes the data and operational uncertainty.
- **The infrastructure-only minimum:** proves technical possibility without user value.
- **The happy-path minimum:** omits the exception that creates most risk.
- **The demo minimum:** produces a persuasive artifact but no repeatable measurement.
- **The platform minimum:** builds reusable machinery before one workflow earns it.

## Add a Stop Rule

Before implementation, write what happens if the slice fails:

- abandon the outcome;
- change the target user or situation;
- test a different mechanism;
- collect better evidence;
- narrow authority further.

If every result leads to “keep building,” the slice is not an experiment.

## Build It

The lab filters candidates by required proof, scores eligible slices, and writes `outputs/slice-decision.json`.
```bash
python3 code/main.py
python3 -m unittest discover code/tests -v
```
Add a cheaper candidate that proves only one required assumption. It should remain ineligible even if its numerical score is high.

## What You Keep

Keep `outputs/slice-decision.json`. It records why this slice is the smallest one that can change the decision.

Source: [AI Engineering from Scratch, phase 14, 50-choose-the-smallest-testable-slice](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/50-choose-the-smallest-testable-slice), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What makes a small slice useful?
A: It can change an important decision. Size matters only in relation to decisive evidence.
Q: What must be defined before comparing candidate slices?
A: The required proof set. Eligibility depends on covering the risky assumptions that need evidence.
Q: Why can a cheap dashboard mockup be the wrong minimum?
A: It may remove data and operational uncertainty from the test. A slice that avoids the risky mechanism cannot answer the decision.
Q: What is the correct response to a high-scoring slice that misses required proof?
A: Reject it as ineligible. Coverage is a gate before optimization.
Q: Why add a stop rule?
A: To specify what evidence would cause reframe, revision, or abandonment. An experiment must be capable of changing the decision.
Q: Which slice is generally safer for testing diagnosis?
A: A read-only replay over representative incidents. Replay can test the core unknown with lower consequence and high reversibility.
```

===DEEPER===
## Exercises

1. Design three slices for the same outcome at different consequence levels.
2. State the required proof set before scoring them.
3. Remove one capability while preserving the decisive evidence.
4. Add a stop rule for a failed pilot.
5. Identify a reusable platform component that should wait until after the slice.

## Further Reading

- [Barry Boehm, A Spiral Model of Software Development and Enhancement](https://dl.acm.org/doi/10.1145/12944.12948), for matching each development cycle to the risks it must resolve.
- [Lenarduzzi and Taibi, MVP Explained: A Systematic Mapping Study on the Definitions of Minimal Viable Product](https://arxiv.org/abs/1609.07592), for the ambiguity around “minimum” and “viable” in software product practice.
