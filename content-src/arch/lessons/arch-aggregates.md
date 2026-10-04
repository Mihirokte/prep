---
id: arch-aggregates
chapter: arch-ddd
title: Aggregates and the sizing mistake
minutes: 4
---
An aggregate is a cluster of domain objects treated as a single consistency unit for changes. One member is the **aggregate root** — the only object external code may reference directly; everything else inside is reached through it. The aggregate's job is to enforce its own **invariants** (business rules that must always hold) within a single transaction boundary.

**The common mistake is aggregates that are too large.** Modelling an entire `Order` — all its line items, shipments, and payment history — as one aggregate that must be loaded and locked together for any change creates contention (two people can't edit different line items at once) and makes the transaction boundary far bigger than the invariant that actually needs protecting.

**The corrective heuristic:** make aggregates as small as possible while still fully enforcing their invariant. If two pieces of data don't need to be transactionally consistent with each other *right now*, they probably don't belong in the same aggregate — reference the other aggregate by ID and accept eventual consistency between them.

```flow
dir: LR
order: Order root | step
line: LineItem | step
ship: Shipment | store
pay: Payment | store
order -> line : one tx
order --> ship : by id, eventual
order --> pay : by id, eventual
```

This is the same instinct as boundary-drawing one level down: keep together only what must change together atomically.

```recall
Q: Why is an aggregate that is too large a problem?
A: It forces unrelated data to be loaded and locked together for any change, creating contention (two edits cannot proceed at once) and a transaction boundary far wider than the invariant actually needs.
Q: What is the rule for deciding whether two entities belong in the same aggregate?
A: Keep them together only if they must be transactionally consistent right now; if not, reference the other by ID and accept eventual consistency between the two aggregates.
Q: Why is the aggregate root the only object external code may reference?
A: So the root can enforce its invariants in one transaction boundary; letting outside code mutate inner members directly would bypass those rules and corrupt consistency.
```
