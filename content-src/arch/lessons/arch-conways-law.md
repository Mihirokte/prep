---
id: arch-conways-law
chapter: arch-ddd
title: Conway's Law
minutes: 4
---
Melvin Conway, 1968: "Any organization that designs a system will produce a design whose structure is a copy of the organization's communication structure." Fowler's gloss: "if a single team writes a compiler, it will be a one-pass compiler; if the team is divided into two, it will be a two-pass compiler."

The mechanism is human, not technical: software coupling is enabled by human communication. If you can talk easily to the author of some code, it is easier to build shared understanding, which makes your code more coupled to theirs — through shared assumptions, not just function calls. Fowler adds: "if an architecture is designed at odds with the development organization's structure, then tensions appear in the software structure."

**Inverse Conway Maneuver:** deliberately reorganise teams into the shape you want the *architecture* to end up in, rather than designing an architecture and hoping the org follows. If you want a modular architecture, structure teams around those modules first; the architecture follows the communication paths. The modern operational lens on this is *Team Topologies* (stream-aligned, platform, enabling, and complicated-subsystem teams).

```flow
dir: LR
org: Team structure | actor
comm: Communication paths | step
arch: System structure | store
org -> comm : shapes
comm -> arch : copies into
arch --> org : tension if mismatched
```

**Interview framing:** Conway's Law is one of the highest-leverage things to raise unprompted when discussing boundaries. It reframes "how should I split this system" as inseparable from "how is my organisation structured, and can I change it." Reasoning about boundaries purely technically — data, traffic — while ignoring the org dimension is exactly the half senior interviewers listen for.

```check
Q: An engineering leadership team wants to migrate a monolithic backend into a decoupled, modular architecture. According to Conway's Law and the Inverse Conway Maneuver, what should they do first?
- Have the single monolithic engineering team design microservice API contracts, trusting the software architecture will naturally modularize the team later.
- Split the codebase into independent microservices first, then hire external consultants to audit and align team communication channels.
* Reorganize engineering into dedicated stream-aligned teams around target functional areas before building out the decoupled services.
- Merge all backend engineers into one large platform team so every engineer shares code ownership across all components.
Why: The Inverse Conway Maneuver explicitly calls for restructuring the organization's teams into the desired architectural shape first, because architecture copies human communication structures. Designing microservices within an unaligned team structure causes tensions in the software structure because shared human communication creates coupling regardless of technical boundaries. Merging teams together increases coupling rather than promoting modularity.
```

```recall
Q: What is the mechanism behind Conway's Law, and why is it human rather than technical?
A: Easy communication between authors builds shared understanding and shared assumptions, which couples their code; so coupling tracks the org's communication structure, not just its function calls.
Q: What is the Inverse Conway Maneuver and when would you use it?
A: Reshape teams into the architecture you want so the design follows the communication paths; use it when you want a target architecture rather than designing one and hoping the org conforms.
Q: Why is reasoning about boundaries only technically a weak answer in an interview?
A: Because architecture copies the org's communication structure, so ignoring team structure means your boundaries will fight the org and tension will show up in the code regardless of the technical split.
```
