---
id: arch-event-sourcing
chapter: arch-styles
title: Event sourcing
minutes: 3
---
Persist state as an append-only sequence of events rather than current-state rows. Current state is derived by replaying the log (or replaying from a periodic snapshot).

```flow
dir: LR
cmd: Command | actor
log: Event log | store
snap: Snapshot | store
fold: Fold apply | step
state: Current state | step
cmd -> log : append
snap -> fold : start from
log -> fold : replay after
fold -> state : derive
```

Two independent sources say the same thing. Fowler: "Event Sourcing ensures that all changes to application state are stored as a sequence of events... we can also use the event log to reconstruct past states." Azure's Architecture Center: "Adopt event sourcing when its benefits, like auditability and historical reconstruction, justify the pattern's complexity. For most systems and most parts of a system, traditional data management is sufficient."

**When it wins:** you need a true audit trail, temporal queries ("what did this look like on date X"), or you are already doing CQRS and want the write-side events to double as the mechanism that feeds the read-side projections.

**When it hurts:** most systems don't need it, and the long-term cost people underestimate is **schema versioning** — replaying events written years ago, in an old shape, forever. Once an event is in the log it is history; you can't migrate it the way you'd ALTER a table.

```recall
Q: Why is schema versioning the cost people underestimate with event sourcing?
A: Events are immutable history, so you cannot ALTER old ones; the fold logic and consumers must handle every past event shape forever, typically via upcasters that transform old versions on read.
Q: When is event sourcing worth its complexity?
A: When you need a true audit trail, temporal queries like "what did this look like on date X", or you already do CQRS and want the write-side events to feed read-side projections.
Q: How do snapshots keep replay cheap without becoming a source of truth?
A: They cache the folded state at a version so load starts there and replays only later events; they are rebuildable from the raw log, so they are a cache you can always delete and regenerate.
Q: How do you correct an event written by mistake?
A: Append a compensating event; you never delete, because both the mistake and its correction are part of the true history.
```

===DEEPER===
**The mechanism: rebuild state by folding the log.** Current state isn't stored — it's *computed*. You load every event for an entity in order and apply each to an initially-empty aggregate: `state = events.reduce(apply, empty)`. `AccountOpened` → balance 0; `Deposited 100` → 100; `Withdrew 30` → 70. The event store is append-only, so writing is a single insert with an optimistic-concurrency check (expected version N, reject if the stream moved). The obvious problem — an account with 4 million events would take forever to replay — is solved with **snapshots**: periodically persist the folded state at version N, then on load start from the latest snapshot and replay only the events after it. A snapshot is a cache, not a source of truth; you can always delete every snapshot and rebuild from the raw log.

**Concrete scenario.** A bank ledger uses event sourcing because the audit requirement is absolute: every balance must be explainable by a sequence of legal transactions, and regulators can ask "what was this balance on 2024-03-15?". That's a native temporal query — replay the stream up to that timestamp. Snapshots are taken every 500 events; a typical account loads one snapshot + a handful of recent events. The log *is* the audit trail, for free.

**The failure mode people get wrong: event schema evolution.** You emitted `{ amount: 100 }` for three years, then the business needs currency, so you want `{ amount: 100, currency: "USD" }`. You cannot ALTER the old events — they're immutable history. So every consumer and the fold logic must handle *both* shapes forever, usually via an **upcaster** that transforms old event versions into the current shape on read (defaulting `currency` to USD for legacy events). Teams that treat events like mutable rows corrupt their history or break replay. Rule: events are facts that happened; you version and upcast, you never rewrite.

**Common follow-ups**

- *"How do you query 'all accounts with balance > X'?"* — You don't, against the log — that's a cross-entity read. You build a projection (a read model / CQRS view) that the events feed. Event sourcing answers "how did *this* entity get here," not ad-hoc aggregate queries.
- *"What are snapshots and when do you take them?"* — A cached fold of state at a version, taken every N events or on a timer, to bound replay cost. Rebuildable from the log, so never authoritative.
- *"How do you handle a bad event that was written by mistake?"* — Append a corrective/compensating event; you don't delete. The mistake and its correction are both part of the true history.
- *"When is event sourcing overkill?"* — When you don't need audit, temporal queries, or event-driven projections. For most CRUD, current-state rows are simpler and sufficient — Azure's own guidance says so.
