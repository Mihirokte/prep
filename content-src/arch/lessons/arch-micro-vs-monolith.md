---
id: arch-micro-vs-monolith
chapter: arch-styles
title: Microservices vs modular monolith (2025-26)
minutes: 5
---
**Microservices** (per Chris Richardson / microservices.io, the standard reference): independently deployable services, each owned by a team, communicating over the network, typically each with its own datastore.

**Modular monolith:** a single deployable unit internally partitioned into modules with enforced boundaries — the same discipline about boundaries as microservices, but the calls are in-process, without the distributed-systems tax.

The current discourse is an actively-forming trend, not settled doctrine, but it clearly leans back toward the monolith:

- Amazon's own Prime Video audio/video monitoring team moved from a distributed serverless/microservices design to a single-process monolith and **cut infrastructure cost by 90%** — per-service orchestration and S3 hops between Lambda steps dominated at their request volume. Caveat: one team, one tightly-coupled high-throughput workload; it is not a blanket "microservices are bad" result.

```bars
title: Prime Video infra cost after consolidating to a monolith
unit: % of original
Distributed microservices | 100
Single-process monolith | 10
```
- A widely-cited 2025 CNCF survey figure (via secondary sources) reports that ~42% of organisations that adopted microservices have consolidated services back into larger deployable units.
- Google's Service Weaver and Spring Modulith are real frameworks built specifically to support the modular-monolith shape.

**Working rule of thumb for 2026:** default to a modular monolith. Reach for microservices only when a *specific, already-felt* pain forces it — independent team scaling (Conway's Law), genuinely independent deploy cadences, or a real per-service scaling bottleneck. Splitting a monolith into network-connected pieces that still share a database and still deploy together is not microservices; it is "a monolith with extra HTTP calls," and strictly worse.

**Interview framing:** if asked "microservices or monolith," don't pick one. Name the actual forcing function — team count, deploy cadence, blast radius — and reason from there.

```recall
Q: What is the default architecture for 2026, and when do you deviate from it?
A: Default to a modular monolith; reach for microservices only when a specific already-felt pain forces it, such as independent team scaling, independent deploy cadences, or a real per-service scaling bottleneck.
Q: Why is "a monolith with extra HTTP calls" strictly worse than the monolith it came from?
A: It pays the distributed-systems tax (partial failure, latency, retries, idempotency) while still sharing a database and deploying together, so it gains none of the independence that would justify the cost.
Q: Does the Prime Video result prove microservices are bad?
A: No; it is one high-throughput, tightly-coupled workload where per-step orchestration and S3 hops dominated, so it argues against over-decomposition, not against the style in general.
Q: What is the right order: boundaries then extraction, or extraction then boundaries?
A: Boundaries first; enforce module boundaries in-process, let them harden, then extract only the module with a proven bottleneck. Extraction does not create boundaries.
```

===DEEPER===
**The mechanism people skip: the distributed-systems tax.** The moment a call crosses the network you inherit partial failure (the callee may have done the work but the response was lost), latency variance, the need for retries + idempotency, and the CAP trade-off. A modular monolith keeps those calls in-process, so an invocation is a function call: no serialization, no timeout tuning, one transaction, one stack trace. Microservices trade that simplicity for *independent deployability* and *independent scaling* — and if you're not cashing in on at least one of those, you paid the tax for nothing.

**Concrete scenario.** A payments team runs a modular monolith with three modules: `ledger`, `payouts`, `reconciliation`. Reconciliation runs a nightly batch that pegs 8 CPU cores for two hours; the rest of the app is a steady 5% CPU. That's a *real* independent-scaling forcing function — you'd rather not provision the whole box for a nightly spike. So you extract `reconciliation` (and only that) into its own service with its own autoscaling group. `ledger` and `payouts` stay in-process because they share transactions and always deploy together. This is the correct shape: extract on a felt bottleneck, not on a diagram.

**The failure mode people get wrong: the distributed monolith.** Teams split by noun (`user-service`, `order-service`, `product-service`), then discover every request fans out to all three and they still share one database. Now they have network hops, distributed transactions, *and* coupled deploys — every downside of microservices with none of the independence. The tell: you can't deploy one service without deploying the others, or a schema change touches three repos.

```flow
dir: LR
req: Request | actor
usr: user-service | step
ord: order-service | step
prd: product-service | step
db: Shared database | store
req -> usr : fans out
usr -> ord : network hop
ord -> prd : network hop
usr -> db : all share
ord -> db : one schema
prd -> db : coupled deploys
```

**Common follow-ups**

- *"When is the network hop actually worth it?"* — When a service scales, deploys, or fails on a genuinely different curve from its neighbours (the reconciliation batch above), or when a distinct team needs to own its release cadence.
- *"How do you split a monolith safely?"* — Enforce module boundaries in-process first (Spring Modulith / Service Weaver), let them harden, then extract the module that has a proven bottleneck. Boundaries earn extraction; extraction doesn't create boundaries.
- *"What breaks first when you go distributed too early?"* — Data consistency. A shared database across services means no service truly owns its data, so you get lock contention and hidden coupling. Each service must own its store first.
- *"Isn't the Prime Video result proof microservices are bad?"* — No — it's one high-throughput, tightly-coupled workload where per-step orchestration and S3 hops dominated. It argues against *over*-decomposition, not against the style.
