---
id: lld-framework
chapter: lld-round
title: A framework that fits in 40 minutes
minutes: 5
---
A time-boxed structure that prevents both classic failures — diving into code before the interviewer follows your structure, and over-polishing the setup until time runs out.

1. **Requirements (~5 min)** — ask across four themes: primary capabilities, rules and completion conditions, error handling, and scope boundaries (what's explicitly out — UI, persistence, networking, auth). Write an explicit requirements + out-of-scope list.
2. **Entities & relationships (~3 min)** — pull the nouns out of the requirements into entities; sketch ownership with boxes and arrows. No formal UML — engineers design directly in code now, and interviewers rarely expect UML.
3. **Class design (~10–15 min)** — per entity, derive **state** and **behavior** straight from the requirements. Keep rules with the entity that owns the data ("Tell, Don't Ask").
4. **Implementation (~10 min)** — pseudocode the one or two most interesting methods: happy path first, then edge cases. Trace one concrete scenario end to end.
5. **Extensibility (~5 min)** — the interviewer proposes a twist; show which seam absorbs it without a rewrite.

```steps
Requirements | Ask capabilities, rules, errors, and scope boundaries, then write an explicit in-scope and out-of-scope list (~5 min)
Entities | Pull the nouns into entities and sketch ownership with boxes and arrows, no formal UML (~3 min)
Class design | Per entity derive state and behavior from the requirements, keeping rules with the entity that owns the data (~10-15 min)
Implementation | Pseudocode the one or two most interesting methods, happy path first then edge cases, and trace one scenario (~10 min)
Extensibility | Take the interviewer's twist and show which seam absorbs it without a rewrite (~5 min)
```

Compressed: **scope it → ground it in entities → commit to a class structure → go deep on the interesting method without breaking down.** Write class outlines as `state` + `behavior` lists, not UML diagrams.

```recall
Q: What two opposite failures does a time-boxed framework prevent?
A: Diving into code before the interviewer follows your structure, and over-polishing the setup until time runs out. The time box forces you to commit to a class structure and still leave room to go deep.
Q: During requirements, why write an explicit out-of-scope list and not just an in-scope one?
A: Naming what is out (UI, persistence, networking, auth) bounds the problem so you do not silently design features nobody asked for, and it shows the interviewer deliberate scoping rather than an omission you forgot.
Q: Why derive state and behavior per entity instead of starting from methods?
A: The requirements name the data each entity owns; deriving behavior from that keeps the rules with the entity that holds the data ("Tell, Don't Ask"), which is what produces clean responsibilities instead of a procedural blob.
Q: Why is UML usually unnecessary in the entities step today?
A: Engineers design directly in code now and interviewers rarely expect formal UML, so boxes and arrows for ownership plus state-and-behavior outlines communicate the shape faster without spending the time budget on diagram formalism.
```
