---
id: scratch-14-51-write-specifications-that-preserve-judgment
chapter: scratch-14-agent-engineering
title: Write Specifications That Preserve Judgment
minutes: 0
---
> A useful specification fixes invariants and evidence while leaving reversible implementation choices open. It is a decision boundary, not a screenplay.

**Type:** Learn + Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 14 lesson 50
**Time:** ~75 minutes

## Learning Objectives

- Separate outcome, invariants, examples, non-goals, and proof.
- Mark decisions as locked, bounded, or delegated.
- Preserve agent judgment where choices are cheap and reversible.
- Require human checkpoints where consequence or public behavior changes.

## Two Bad Extremes

An underspecified task asks an agent to guess the system. An overspecified task asks it to transcribe a design that may already be wrong.

The useful middle is an executable contract:

| Surface | Purpose |
|---|---|
| Outcome | The observable result |
| Invariants | Conditions that must always remain true |
| Examples | Concrete cases that reveal intent |
| Non-goals | Adjacent behavior intentionally excluded |
| Decision policy | Which choices are locked, bounded, or delegated |
| Proof | Evidence required before completion |

## Three Decision Modes

- **Locked:** the agent must not choose. Use for public compatibility, authority, safety, irreversible cost, or a product commitment.
- **Bounded:** the agent may choose inside explicit limits. Use for search budgets, retry counts, allowed dependencies, or a known interface family.
- **Delegated:** the agent owns the choice and must explain it. Use for local structure, names, reversible refactors, and implementation details.
```flow
dir: LR
D: Decision | step
C: Consequence and reversibility | gate
L: Locked | step
B: Bounded | step
A: Delegated | step
H: Human checkpoint | actor
P: Agent proposes within limits | step
I: Agent implements and proves | step
D -> C
C -> L : High consequence
C -> B : Known safe range
C -> A : Cheap and reversible
L -> H
B -> P
A -> I
```

## Specify Behavior Through Examples

Examples compress intent better than adjectives. “Helpful,” “robust,” and “production-ready” are not executable. A small set of normal, edge, failure, and forbidden examples gives both the builder and verifier something concrete.

Examples do not replace invariants. One passing case cannot prove a universal safety rule.

## Proof Must Match the Claim

- A unit test proves a local function contract.
- A wire test proves serialization and transport behavior.
- A browser journey proves an interface path.
- A replay set proves behavior over representative cases.
- An audit log proves that authority boundaries held.

Do not accept a lower layer as proof of a higher-layer claim.

## Preserve Unknowns Deliberately

A specification can say “the implementation may choose any read-only source that returns within the time budget.” That is not vagueness. It is an intentional delegated decision with a boundary and proof.

Specifications should evolve when evidence changes. Preserve the reason behind locked and bounded choices so later teams can revise them without archaeology.

## Build It

The lab validates every contract surface, checks decision modes, and writes `outputs/executable-specification.json`.
```bash
python3 code/main.py
python3 -m unittest discover code/tests -v
```
Move the production-write decision from locked to delegated. Explain why the schema accepts the value but the product risk does not.

## What You Keep

Keep `outputs/executable-specification.json`. It becomes the contract that coding agents and human reviewers share.

Source: [AI Engineering from Scratch, phase 14, 51-write-specifications-that-preserve-judgment](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/14-agent-engineering/51-write-specifications-that-preserve-judgment), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What is the useful middle between under- and over-specification?
A: An executable contract that fixes invariants and evidence while preserving reversible choices. The contract constrains outcomes and risk without scripting every implementation detail.
Q: Which decision should usually be locked?
A: Whether the system may write to production. Authority and high-consequence behavior require a human-owned decision.
Q: What is a bounded decision?
A: The agent may choose inside explicit safe limits. Bounds preserve useful judgment while keeping risk controlled.
Q: Why pair examples with invariants?
A: Examples reveal intent while invariants state conditions that must always hold. Concrete cases and universal constraints serve different roles.
Q: What proof matches a user-journey claim?
A: A browser or end-to-end journey observation. Proof must operate at the same layer as the claim.
Q: Why record rationale for locked decisions?
A: So later evidence can revise the choice without archaeology. Traceable reasons let specifications evolve deliberately.
```

===DEEPER===
## Exercises

1. Convert a backlog ticket into the six specification surfaces.
2. Replace three implementation instructions with one invariant and two examples.
3. Mark every decision and justify each locked or bounded choice.
4. Add a proof receipt for every invariant.
5. Remove a constraint that has no evidence or risk rationale.

## Further Reading

- [Nuseibeh and Easterbrook, Requirements Engineering: A Roadmap](https://www.cs.toronto.edu/~sme/papers/2000/ICSE2000.pdf), for the relationship among goals, precise specifications, validation, agreement, and evolution.
- [Zave and Jackson, Four Dark Corners of Requirements Engineering](https://doi.org/10.1145/237432.237434), for separating environmental assumptions, requirements, and specifications.
- [Gotel and Finkelstein, An Analysis of the Requirements Traceability Problem](https://doi.org/10.1109/ICRE.1994.292398), for preserving why a requirement exists and where it came from.
