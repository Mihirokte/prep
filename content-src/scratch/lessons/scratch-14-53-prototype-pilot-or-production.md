---
id: scratch-14-53-prototype-pilot-or-production
chapter: scratch-14-agent-engineering
title: Choose Prototype, Pilot, or Production Deliberately
minutes: 0
---
> These are different learning environments, not levels of polish. Choose the stage that answers the current unknown with the least unnecessary consequence.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 14 lessons 50 to 52
**Time:** ~70 minutes

## Learning Objectives

- Choose a build stage from the unknown, audience, data, consequence, and readiness.
- Define stage-specific controls and exit criteria.
- Prevent prototypes from quietly becoming production systems.
- Delay real authority until evidence and operations justify it.

## Three Different Questions

| Stage | Primary question |
|---|---|
| Prototype | Can this mechanism produce the evidence at all? |
| Pilot | Does it work safely with a bounded real audience and real conditions? |
| Production | Can we own it continuously at the promised reliability and risk level? |

A prototype can be technically complete and still be disposable. A pilot can use production data while remaining limited in audience and authority. Production begins when the organization accepts ongoing responsibility.

## Prototype

Use a prototype when the unknown does not require real users or real data. Keep it:

- discardable;
- isolated;
- narrow in behavior;
- explicit about the learning question;
- free of false operational guarantees.

Do not optimize architecture before the mechanism earns another stage.

## Pilot

Use a pilot when the unknown requires real behavior, realistic data, or a real workflow, but consequence or readiness is not yet compatible with broad release.

A pilot needs:

- a named audience;
- a human owner;
- bounded duration and authority;
- audit and rollback;
- outcome and guardrail thresholds;
- exit criteria for expand, revise, or stop.

## Production

Production needs more than deployment:

- service level objective;
- on-call and incident ownership;
- security and privacy review;
- cost and capacity controls;
- rollback and recovery;
- continuous monitoring;
- a retirement path.
```flow
dir: LR
U: Unknown | step
R: Needs real users or data? | gate
P: Prototype | step
C: Consequence bounded and operations re... | gate
L: Pilot | step
D: Production | step
U -> R
R -> P : No
R -> C : Yes
C -> L : No
C -> D : Yes
```

## Stage Drift

Prototype code becomes dangerous when it acquires users, data, or authority without acquiring ownership. Mark prototype and pilot boundaries in configuration, access control, telemetry, and documentation. A warning banner is not enough.

The stage should be observable from the system itself.

## Build It

The lab chooses a stage from the decision context, returns required controls, and writes `outputs/stage-decisions.json`.
```bash
python3 code/main.py
python3 -m unittest discover code/tests -v
```
Change the pilot example to low consequence with operational readiness. Explain what additional evidence would justify production.

## What You Keep

Keep `outputs/stage-decisions.json`. It records why each stage is justified and which controls must exist before the next one.

Source: [AI Engineering from Scratch, phase 14, 53-prototype-pilot-or-production](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/53-prototype-pilot-or-production), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What primarily distinguishes prototype, pilot, and production?
A: The learning question, real exposure, consequence, and ownership. The stages are different evidence and responsibility environments.
Q: When is the prototype stage appropriate?
A: When the unknown can be answered without real users or real data. A prototype should answer the mechanism question with minimal consequence.
Q: What must a pilot include?
A: Bounded audience, owner, rollback, audit, metrics, and exit criteria. A pilot exposes realistic conditions inside explicit limits.
Q: When does a deployed build become production in the meaningful sense?
A: When the organization accepts continuous reliability, risk, and operational ownership. Production is an ongoing responsibility, not merely a hosting state.
Q: What does stage drift mean?
A: A prototype gains users, data, or authority without gaining controls and ownership. Uncontrolled exposure turns a learning artifact into an unsafe service.
Q: Why must stage boundaries be enforced technically?
A: A warning banner cannot prevent access or authority. Configuration, access control, and telemetry make the stage observable and enforceable.
```

===DEEPER===
## Exercises

1. Classify three current projects by learning stage, not deployment status.
2. Write pilot exit criteria that include a stop decision.
3. Add a technical control that prevents a prototype from reaching production data.
4. Identify the first operational responsibility that makes the build production.
5. Design a rollback receipt for the bounded pilot.

## Further Reading

- [Barry Boehm, A Spiral Model of Software Development and Enhancement](https://dl.acm.org/doi/10.1145/12944.12948), for matching each iteration’s commitment to resolved risk.
- [Fagerholm et al., Building Blocks for Continuous Experimentation](https://doi.org/10.1145/2601248.2601276), for the organizational and technical conditions required to run experiments continuously.
