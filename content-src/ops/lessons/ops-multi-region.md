---
id: ops-multi-region
chapter: ops-resilience
title: Multi-region deployments
minutes: 4
---
Running in more than one geographic region buys two things: **lower latency** (serve users from a nearby region) and **disaster survival** (an entire region can go down and you stay up). It also introduces the hardest problem in distributed systems — keeping data consistent across long distances — so it's a deliberate trade-off, not a default.

Common shapes, increasing in cost and complexity:

- **Active-passive** — one region serves all traffic; a second stands by with replicated data, ready to take over on failover. Simpler; the standby's capacity is mostly idle.
- **Active-active** — multiple regions serve live traffic simultaneously. Best latency and utilization, but now writes can happen in two places at once, forcing you to confront conflict resolution and cross-region replication lag head-on.

```flow
dir: LR
users: Users | actor
r1: Region 1 | store
r2: Region 2 | store
passive: Standby, idle | store
conflict: Conflict resolution | gate
users -> r1 : active-passive
r1 --> passive : replicate data
passive --> r1 : failover
users -> r2 : active-active
r1 --> conflict : concurrent writes
r2 --> conflict : concurrent writes
```

The physics you can't escape: the speed of light makes a synchronous, strongly-consistent write across continents slow (a round trip of ~100 ms+). So multi-region systems usually accept **eventual consistency** for most data and reserve synchronous cross-region coordination for the few things that truly need it. Data residency and regulatory rules (where user data is legally allowed to live) often drive the design as much as performance does.

```check
Q: A retail company deploys an active-active multi-region architecture across North America and Europe to reduce browsing latency. However, customer product reviews and inventory updates are experiencing cross-region replication lag. How should the team architect writes according to multi-region trade-offs?
- Both regions should execute synchronous cross-region writes for every catalog update to guarantee immediate consistency.
* The service should accept eventual consistency for reviews and reserve synchronous cross-region coordination for inventory decrementing.
- The service should switch to an active-passive setup so that browsing latency improves across all continents.
- All database writes should bypass local databases and write directly to a single centralized region without conflict handling.
Why: Because physical distance and the speed of light make cross-region synchronous coordination slow, systems should default to eventual consistency for non-critical writes like product reviews, reserving strict coordination only for sensitive operations like inventory. A common misconception is trying to enforce synchronous strong consistency everywhere, which ruins performance and negates the latency benefits of multi-region deployment.
```

```recall
Q: What two benefits justify running in multiple regions?
A: Lower latency by serving users from a nearby region, and disaster survival since an entire region can go down while you stay up.
Q: Why is active-active harder than active-passive?
A: In active-active, writes can happen in two regions at once, forcing you to handle conflict resolution and cross-region replication lag. Active-passive sends all traffic to one region with a standby, avoiding concurrent writes.
Q: Why do multi-region systems usually accept eventual consistency?
A: The speed of light makes a synchronous strongly-consistent write across continents slow, around 100 ms or more per round trip, so most data is kept eventually consistent and synchronous coordination is reserved for the few things that need it.
Q: Besides performance, what often drives multi-region design?
A: Data residency and regulatory rules about where user data is legally allowed to live, which can dictate the design as much as latency does.
```
