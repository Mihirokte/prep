---
id: lld-rate-limiter
chapter: lld-concurrency-api
title: Rate limiter: where correctness and scarcity meet
minutes: 4
---
The Rate Limiter is *the* canonical LLD concurrency problem, because Correctness and Scarcity both apply at once: concurrent requests from one client update a shared counter/bucket (must be atomic), and the whole point is bounding a scarce resource.

The interview usually wants you to pick one algorithm and justify it:

| Algorithm | Idea | Weakness |
|---|---|---|
| Fixed window | count per calendar minute | 2x burst at the window edge |
| Sliding window log | timestamp per request | memory grows with volume |
| Sliding window counter | weighted current + previous window | approximate, but O(1) memory |
| **Token bucket** | refill tokens at a rate, spend one per request | — allows controlled bursts |
| Leaky bucket | queue and drain at fixed rate | smooths bursts, adds latency |

Token bucket is the usual answer: the cap is your burst tolerance, the refill rate your sustained limit. Sliding window counter is the memory-bounded default when you *don't* want bursts.

```flow
dir: LR
refill: Refill at rate | step
bucket: Token bucket (cap) | store
req: Request | actor
allow: Allow, spend 1 | step
reject: Reject (empty) | gate
refill -> bucket : add tokens
req -> bucket : need a token
bucket -> allow : token available
bucket -> reject : no tokens
```

Two design points that score: make the per-client counter update **atomic** (lock or CAS), and keep per-client state **independent** — keyed `Map<ClientId, BucketState>`, never one global counter, so one client's traffic can't eat another's quota. State usually lives in a shared store (Redis) because a per-server limit behind a load balancer isn't a real limit.

```recall
Q: Why is the rate limiter the canonical LLD concurrency problem?
A: Correctness and Scarcity apply at once: concurrent requests from one client update a shared counter or bucket that must be updated atomically, and the whole purpose is bounding a scarce resource. It forces both an atomicity decision and a resource-cap design.
Q: Why is token bucket the usual chosen algorithm, and what do its two parameters mean?
A: It allows controlled bursts while bounding the sustained rate: the bucket capacity is your burst tolerance and the refill rate is your sustained limit. That maps cleanly to real API limits, unlike fixed window which permits a 2x edge burst.
Q: When would you pick sliding window counter over token bucket?
A: When you specifically do not want bursts and need bounded memory. It weights the current and previous window for an O(1)-memory approximation, whereas a sliding window log grows with request volume.
Q: Why must per-client state be independent and usually live in a shared store?
A: One global counter lets one client's traffic eat another's quota, so state is keyed per client (Map ClientId -> BucketState). It lives in a shared store like Redis because a per-server limit behind a load balancer is not a real limit when retries hit different instances.
```
