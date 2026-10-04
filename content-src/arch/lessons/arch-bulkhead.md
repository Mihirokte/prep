---
id: arch-bulkhead
chapter: arch-cross-cutting
title: Bulkhead and cell-based isolation
minutes: 4
---
Isolate resources — thread pools, connection pools, or whole deployment units — per dependency or per tenant, so one dependency's failure or one tenant's abusive load can't exhaust resources shared by everything else. Named after ship bulkheads that keep a hull breach from sinking the whole vessel.

**When it wins:** multi-tenant systems, or any system calling several downstream dependencies with very different reliability profiles. Without a bulkhead, one flaky dependency's slow calls can consume the entire thread pool and starve calls to healthy dependencies too.

**Bulkhead at scale — cell-based architecture.** AWS's Well-Architected Framework treats cell-based architecture explicitly as a bulkhead pattern applied to whole deployment units: "a cell-based architecture uses multiple isolated instances of a workload... each cell is independent, does not share state with other cells, and handles a subset of the overall workload requests." A request is routed to exactly one cell (via a partition key cached at login), and a failure inside a cell cannot escape it. InfoQ's 2025 trends panel calls it out as a rising resilience technique, connected to a string of 2025 cloud outages where one shared service or config change triggered cascading failures across everything.

```flow
dir: LR
req: Request | actor
router: Router | gate
c1: Cell 1 | store
c2: Cell 2 | store
c3: Cell 3 | store
req -> router : partition key
router -> c1 : subset A
router -> c2 : subset B
router -> c3 : subset C
```

```recall
Q: What resource exhaustion does a bulkhead prevent that a timeout alone does not?
A: One flaky dependency's slow calls consuming the entire shared thread or connection pool and starving calls to healthy dependencies; isolating a pool per dependency contains that blast radius.
Q: How does cell-based architecture apply the bulkhead idea at deployment scale?
A: Each cell is an independent instance of the whole workload handling a subset of requests with no shared state, so a failure inside one cell cannot escape to the others.
Q: Why is a partition key central to cell-based isolation?
A: It routes each request to exactly one cell deterministically, so a tenant or request stays contained in its cell and a cell failure affects only that subset of traffic.
```
