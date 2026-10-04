---
id: lld-what-it-is
chapter: lld-round
title: What LLD actually is
minutes: 3
---
LLD, OOD, and machine coding are the same interview under different names. You get a short prompt — "design a parking lot", "design an elevator", "design Tic Tac Toe" — and roughly 35–45 minutes to turn it into classes, interfaces, state, and method signatures. India-style machine-coding rounds run 60–90 minutes and expect compiling, runnable code.

This is **not** system design. System design is architecture at scale — services, databases, queues, sharding — drawn as boxes and arrows with no code. LLD is the blueprint for one box: you write the `Ticket` class, the `SpotType` enum, the `FeeCalculator` interface, and show how they collaborate inside a single process.

Know the regional variant before you walk in. US big-tech wants partial real code and grades your *reasoning* about patterns; India/Asia mid-size rounds often want you to *name* the pattern (Factory, Strategy, Singleton) directly and may run test cases live. Asking the recruiter which variant to expect is sanctioned, not a weakness signal.

```flow
dir: TB
ask: Which variant | gate
us: US big-tech | step
asia: India/Asia | step
reason: Reason about patterns | step
name: Name the pattern | step
code: Partial real code | step
run: Runnable, tests live | step
ask -> us : grades reasoning
ask -> asia : grades naming
us -> reason
reason -> code
asia -> name
name -> run
```

The single most penalised failure mode is the same everywhere: jumping straight to code without scoping, then running out of time.

```recall
Q: Why is LLD not the same as system design?
A: System design is architecture at scale (services, databases, queues) drawn as boxes with no code. LLD is the blueprint for one process: concrete classes, interfaces, state, and method signatures that collaborate inside a single box.
Q: What is the single most penalised failure mode, and why?
A: Jumping straight to code without scoping, then running out of time. Scoping first anchors the entities and the time budget, so you finish a coherent design instead of an unfinished one.
Q: Why ask the recruiter which regional variant to expect?
A: The variants grade different things (US rewards reasoning about patterns and partial real code; India/Asia often wants the pattern named and tests run live), so knowing the variant lets you aim your 35-45 minutes at what is actually scored. It is sanctioned, not a weakness signal.
```
