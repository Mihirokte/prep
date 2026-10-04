---
id: sd-latency-multiregion
chapter: sd-data-at-scale
title: Latency, tail latency & multi-region
minutes: 4
---
**Latency** is time per request; **throughput** is requests per second. They're different axes — a system can be high-throughput and high-latency (a batch pipeline) or low-latency and low-throughput. Design targets should name both.

The number that matters in practice is not the average but the **tail**: **p99 latency** means 99% of requests are faster than this, 1% are slower. Averages hide pain — if 1% of requests take 5 seconds, plenty of users feel it, especially since one page often makes many backend calls and waits for the slowest. Optimising the tail (p99, p999) is usually where reliability work goes. A related trap: **fan-out** amplifies tail latency — call 10 services in parallel and your latency is the *slowest* of the 10, so p99s compound.

```flow
dir: LR
page: Page request | actor
agg: Aggregator | gate
a: Service A fast | step
b: Service B fast | step
c: Service C slow p99 | step
resp: Response | step
page -> agg
agg -> a
agg -> b
agg -> c
c -> resp : waits for slowest
```

**Clock skew** — machine clocks drift apart, so "wall-clock time" can't be trusted to order events across servers. This is why distributed systems lean on logical ordering (sequence numbers, vector clocks) rather than timestamps for correctness.

**Multi-region** deployment puts your system in several geographic regions for lower user latency and survival of a whole-region outage. It's a large step up in complexity — cross-region data replication, consistency, and failover — and at SDE2 level you're expected to know *when* it's warranted (global users, strict availability SLAs) and that it's not free, not to design the whole thing unprompted.

```recall
Q: Why report p99 instead of average latency?
A: The average hides the tail. If 1% of requests take 5 seconds, many users still feel it, and since one page often makes many backend calls, it waits for the slowest of them, so tail latency drives perceived speed.
Q: How does fan-out amplify tail latency?
A: Calling many services in parallel means your latency is the slowest of them, so each extra parallel call raises the chance one is slow. The p99s compound rather than average out.
Q: Why do distributed systems avoid wall-clock timestamps for ordering?
A: Machine clocks drift apart (clock skew), so timestamps cannot be trusted to order events across servers. They use logical ordering like sequence numbers or vector clocks for correctness instead.
Q: When is multi-region warranted at SDE2 level?
A: When you have global users or strict availability SLAs that need to survive a whole-region outage. It is a large complexity step with cross-region replication and failover, so you justify it rather than add it by default.
```
