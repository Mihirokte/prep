---
id: sd-connection-replicas
chapter: sd-data-at-scale
title: Connection pooling & read replicas
minutes: 4
---
Opening a database connection is expensive (TCP + auth + session setup), and databases cap how many can be open at once. A **connection pool** keeps a set of open connections and hands them out to requests, returning them when done. Without it, a traffic spike opens thousands of connections and the database falls over. The pool size is a real tuning knob: too small and requests queue; too large and you exhaust the DB's limit.

**Read replicas** attack a different problem: read-heavy load. You keep one **primary** that takes all writes, and stream its changes to one or more **replicas** that serve reads. Reads scale horizontally by adding replicas; the primary is freed up for writes.

The catch is **replication lag** — a replica may be milliseconds-to-seconds behind, so a user who just wrote and immediately reads from a replica might not see their own change ("read-your-writes" violation). Fixes: route that user's reads to the primary briefly, or read from the primary for read-after-write paths. Name this trade-off when you propose replicas — it's the follow-up the interviewer is waiting for.

```flow
dir: LR
app: App servers | step
pool: Connection pool | gate
primary: Primary | store
r1: Replica 1 | store
r2: Replica 2 | store
app -> pool
pool -> primary : writes
pool -> r1 : reads
pool -> r2 : reads
primary --> r1 : stream changes
primary --> r2 : stream changes
```

```check
Q: A user updates their display name in a web app, but upon immediate page reload, their old name still displays. Refreshing again several seconds later shows the correct updated name. If read replicas are in use, how should the architecture be adjusted to fix this issue?
- Direct all database read and write traffic exclusively to read replicas to balance load.
* Route the user's profile read queries to the primary database temporarily immediately following an update.
- Increase the connection pool limit on the read replicas so writes propagate instantly.
- Add a secondary composite index on the user profile table in each replica.
Why: Replication lag causes read replicas to temporarily serve stale data directly after an update, causing a read-your-writes violation. Routing immediate post-update reads to the primary ensures the user sees their own recent write while keeping the replicas for ordinary read traffic. Directing all reads to the primary or adjusting connection pools does not address the replication stream latency between primary and replicas.
```

```recall
Q: What breaks without a connection pool under a traffic spike?
A: Each request opens a fresh connection, which is expensive (TCP, auth, session setup) and the database caps concurrent connections. A spike opens thousands at once and the database falls over.
Q: Why can the pool size be too large as well as too small?
A: Too small and requests queue waiting for a free connection; too large and you exhaust the database's own connection limit. It is a real tuning knob between queuing and overload.
Q: What problem do read replicas solve, and what new problem do they create?
A: They scale read-heavy load by serving reads off copies while the primary takes writes. The new problem is replication lag, so a replica can be behind and serve stale data.
Q: A user writes then immediately reads from a replica and does not see their change. What is this and how do you fix it?
A: A read-your-writes violation from replication lag. Fix it by routing that user's reads to the primary briefly, or read from the primary on read-after-write paths.
```
