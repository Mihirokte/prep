---
id: scratch-14-47-outcomes-before-output
chapter: scratch-14-agent-engineering
title: Define the Outcome Before You Choose the Output
minutes: 0
---
> Fast implementation increases the penalty for choosing the wrong problem. Shape the outcome first so speed points in the right direction.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** None
**Time:** ~60 minutes

## Learning Objectives

- Write an outcome frame without naming a solution.
- Identify the user, situation, current behavior, and desired change.
- Make constraints and non-goals explicit.
- Detect solution leakage before it hardens into scope.

## Output Is Not Outcome

“Build an incident assistant” names an output. It does not say who needs it, what becomes better, or what must remain safe.

An outcome frame says:

> When a production alert arrives, the on-call engineer identifies the failing service and a safe next action within two minutes, while diagnosis remains read-only and auditable.

That sentence can be satisfied by software, a runbook, a data repair, or a smaller interface change. It keeps the team attached to the result rather than the first artifact someone imagined.

## The Six-Part Frame

| Part | Question |
|---|---|
| User | Who experiences the problem directly? |
| Situation | When and where does it occur? |
| Current behavior | What happens today, including workarounds? |
| Desired outcome | What observable state should improve? |
| Constraints | Which safety, policy, cost, or compatibility limits are fixed? |
| Non-goals | What tempting adjacent work is excluded? |
```flow
dir: LR
U: User and situation | actor
C: Current behavior | step
O: Desired outcome | step
K: Constraints | step
N: Non-goals | step
E: Evidence question | step
U -> C
C -> O
O -> K
K -> N
N -> E
```

## Find Solution Leakage

Outcome statements leak solutions when they contain a product form, interface, model choice, framework, or architecture that has not been earned by evidence.

- “Users receive a weekly AI summary” leaks the summary and cadence.
- “Users understand account changes before approval” states the result.
- “Deploy a vector database” leaks infrastructure.
- “Relevant policy evidence is available during review” states a capability.

Constraints can name technology when compatibility truly fixes it. Record why it is fixed.

## Constraints Protect the Outcome

Constraints are not implementation details. They are part of the real-world goal:

- no production writes during diagnosis;
- response within the incident time budget;
- existing audit events remain authoritative;
- no new runtime dependency;
- accessibility behavior remains intact.

A build that reaches the outcome by violating a constraint has not reached the outcome.

## Non-Goals Create a Boundary

Non-goals prevent a useful slice from turning into a platform. Good non-goals are concrete enough to reject work:

- no automatic remediation;
- no new alert-routing system;
- no replacement of the incident commander;
- no historical analytics in this slice.

## Build It

The lab validates an `OutcomeFrame` and writes `outputs/outcome-frame.json`.
```bash
python3 code/main.py
python3 -m unittest discover code/tests -v
```
Replace the desired outcome with “use the incident assistant.” The validator should flag that the proposed output leaked into the outcome.

## What You Keep

Keep `outputs/outcome-frame.json`. The next lesson tests it against the workflow people actually perform.

Source: [AI Engineering from Scratch, phase 14, 47-outcomes-before-output](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/47-outcomes-before-output), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Which statement is an outcome rather than an output?
A: Identify the failing service within two minutes while remaining read-only. The statement names an observable change and constraint without fixing the artifact.
Q: Why does faster implementation increase shaping risk?
A: Teams can commit to the wrong problem before learning catches up. Speed amplifies the cost of an unearned direction.
Q: What belongs in an outcome frame?
A: User, situation, current behavior, desired outcome, constraints, and non-goals. The six surfaces connect the build to a real situation and boundary.
Q: When may an outcome frame name technology?
A: When a verified compatibility constraint truly fixes it. Technology belongs only when evidence makes it a real constraint.
Q: What is the role of non-goals?
A: Reject tempting adjacent work in this slice. Concrete non-goals keep the build attached to its current outcome.
Q: When has a constrained outcome failed?
A: When the desired result is reached by violating a fixed constraint. Constraints are part of the outcome, not optional implementation guidance.
```

===DEEPER===
## Exercises

1. Rewrite a feature request from your backlog as an outcome frame.
2. Add one constraint that changes which solutions remain possible.
3. Add two non-goals that keep the first slice small.
4. Identify the earliest observation that would disprove the desired outcome.
5. Write three different outputs that could satisfy the same outcome.

## Further Reading

- [Nuseibeh and Easterbrook, Requirements Engineering: A Roadmap](https://www.cs.toronto.edu/~sme/papers/2000/ICSE2000.pdf), for treating real-world goals as the anchor for software work.
- [Dardenne, van Lamsweerde, and Fickas, Goal-Directed Requirements Acquisition](https://doi.org/10.1016/0167-6423(93)90021-G), for refining high-level goals into constraints and operational requirements.
