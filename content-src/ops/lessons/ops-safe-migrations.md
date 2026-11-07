---
id: ops-safe-migrations
chapter: ops-release
title: Safe service and data migrations
minutes: 3
---
A migration moves traffic, state, or responsibility while the old and new systems coexist. Success is not merely copying data. The new path must preserve behavior, downstream contracts, observability, and a rollback route throughout the transition.

## Define parity first

List what must remain equivalent: API results, side effects, ordering, latency, security policy, audit records, and downstream events. Convert each claim into a measurable comparator. If parity cannot be observed, cutover is a guess.

```flow
dir: LR
client: Client traffic | actor
router: Traffic router | gate
old: Old service | step
new: New service | step
compare: Shadow comparator | gate
metrics: Migration dashboard | store
client -> router
router -> old : primary
router --> new : shadow
old -> compare : result
new -> compare : result
compare -> metrics : differences
```

Shadow traffic is useful for read paths but must not duplicate writes. For writes, use a controlled dual-write, change-data-capture stream, or backfill plus incremental catch-up. Define one source of truth during every phase.

```check
Q: A team is preparing to migrate an order processing service to a redesigned microservice architecture. They want to validate behavioral parity between the old and new services under production traffic before cutting over. Which approach follows safe migration practices?
- Mirror both read queries and write mutations directly to the new service so its database stays in sync.
- Declare the migration complete as soon as total row counts match between the old and new databases.
* Shadow read traffic to compare responses while designating the old service as the sole authoritative writer.
- Reroute 100% of write traffic to the new service first, while keeping reads on the old service.
Why: Shadowing is intended for read paths to compare behavior without risk, while writes must remain strictly isolated to a single authoritative source to prevent duplicate side effects. Shadowing write traffic is a tempting mistake, but duplicating write operations causes irreversible side effects like duplicate orders or double-billing.
```

## Move in reversible steps

Prepare capacity and dashboards before traffic. Start with internal or low-risk tenants, then increase exposure in small stages. Hold each stage long enough to cover ordinary and delayed workflows. Abort automatically when error, latency, data-difference, backlog, or downstream health crosses a declared threshold.

```steps
Inventory | Map callers data stores events and operational ownership
Prepare | Add compatibility capacity dashboards and rollback tooling
Shadow | Compare behavior without changing authoritative writes
Canary | Move a small named cohort and hold for delayed effects
Ramp | Increase traffic under automated guardrails
Finalize | Transfer ownership then retire old dependencies deliberately
```

## Treat data separately

Copy historical data in resumable batches, then catch up changes produced during the copy. Validate business invariants and sampled records. Do not cut over because byte counts match. Plan how deletes, late events, retries, and out-of-order updates behave.

## Make rollback real

Rollback must specify traffic, writes, and data. Routing traffic back is insufficient if the new system accepted writes the old one cannot see. Keep compatibility until the old system can consume or replay new changes, or declare a clear point of no return with an approved forward-recovery plan.

```recall
Q: Why is copied row count not enough to prove migration parity?
A: Counts do not prove business meaning, side effects, ordering, deletes, or downstream contracts are equivalent.
Q: What must be authoritative during dual operation?
A: One explicitly named source of truth, plus a reconciliation mechanism for differences.
Q: Why can shadowing be dangerous for writes?
A: Replaying a write to both paths may duplicate irreversible side effects, so shadowing should be read-only or specially isolated.
Q: What makes rollback more than traffic routing?
A: The old path must also understand or recover writes accepted by the new path, otherwise routing back loses state.
```
