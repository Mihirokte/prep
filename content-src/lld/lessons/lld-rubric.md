---
id: lld-rubric
chapter: lld-round
title: What the rubric rewards
minutes: 3
---
Every company scores its own way, but the underlying axes repeat. Hello Interview's five:

1. **Problem analysis** — do you extract entities and ask clarifying questions *before* writing a class?
2. **Class design** — are responsibilities, method signatures, and ownership boundaries clean? Weak class design compounds into everything downstream.

```flow
dir: LR
analysis: Problem analysis | step
classes: Class design | step
quality: Code quality | step
extend: Extensibility | step
analysis -> classes : entities
classes -> quality : clean boundaries
classes -> extend : seams to extend
```
3. **Code quality** — encapsulation, composition over inheritance, naming, dependency direction. The craft, even in pseudocode.
4. **Extensibility** — can your design absorb *one* plausible follow-up without a rewrite? Not "anticipate every future".
5. **Communication** — a structured, narrated thought process, and adjusting cleanly when the interviewer probes.

At SDE2 / ~3 YoE the bar is bounded: correct entity decomposition without prompting, SOLID applied *without over-applying it*, one or two extensions handled cleanly, and comfort with at least one concurrency wrinkle if the role touches backend. Heavy pattern-stacking and distributed variants are senior-only — don't over-prepare defensively at the cost of fluency on the basics.

```recall
Q: Which rubric axis compounds into the others if you get it wrong, and why?
A: Class design. Weak responsibilities, signatures, and ownership boundaries propagate downstream into poor code quality and brittle extensibility, so a shaky decomposition drags every later axis down with it.
Q: What does the extensibility axis actually reward, and what does it not?
A: Absorbing one plausible follow-up without a rewrite, by having designed a seam for it. It does not reward anticipating every possible future, which is over-engineering and costs you on the simplicity-of-design side.
Q: At SDE2 / ~3 YoE, why is heavy pattern-stacking a bad use of prep time?
A: The bar is bounded: correct entity decomposition, SOLID applied without over-applying, one or two clean extensions, and one concurrency wrinkle for backend roles. Pattern-stacking and distributed variants are senior-only, so drilling them trades away fluency on the basics that are actually scored.
```
