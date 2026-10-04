---
id: sd-rate-limiting
chapter: sd-fundamentals
title: Rate limiting
minutes: 3
---
Rate limiting protects a service from abuse and overload. The algorithm you name signals how much you understand.

- **Fixed window** — count requests per calendar minute. Simple, but allows a burst of 2x the limit at the window boundary.
- **Sliding window** — smooths the boundary problem by weighting the previous window.
- **Token bucket** — the usual interview answer. A bucket refills tokens at a steady rate up to a cap; each request spends one. It allows short bursts (spend the saved tokens) while bounding the sustained rate. Cap = burst tolerance, refill rate = sustained limit.

Where it lives: at the edge (API gateway) for coarse per-client limits, and sometimes per-service for fine-grained ones. State (the counters/buckets) usually lives in Redis so all app servers share one view — a per-server limit is not a real limit behind a load balancer.

```flow
dir: LR
req: Request | actor
refill: Refill tokens by rate | step
check: Tokens >= 1? | gate
allow: Spend token, allow | step
deny: 429 Too Many Requests | step
req -> refill
refill -> check
check -> allow : yes
check -> deny : no
```

```recall
Q: Why does a fixed-window limiter allow a burst of twice the limit?
A: A client can send the full limit at the end of one window and the full limit again at the start of the next, both within a short span across the boundary. Sliding window removes this by weighting the previous window.
Q: In token bucket, what do the cap and the refill rate control?
A: The cap is burst tolerance, the most tokens that can accumulate, and the refill rate is the sustained limit. A client idle for a while has a full bucket and can burst, then settles to the refill rate.
Q: Why must rate-limit state usually live in Redis rather than per server?
A: Behind a load balancer, requests spread across many app servers. A per-server counter only sees part of the traffic, so it is not a real limit; shared Redis state gives all servers one consistent view.
Q: On a Redis outage, what is the fail-open versus fail-closed choice?
A: Fail open allows requests for availability; fail closed rejects them for protection. It is a deliberate trade: open risks overload during the outage, closed risks blocking legitimate traffic.
```

===DEEPER===
**Mechanism.** Token bucket stores two numbers per client: `tokens` and `last_refill_ts`. On each request you lazily refill — `tokens = min(cap, tokens + (now - last_refill) * rate)` — then allow if `tokens >= 1` and decrement. No background timer needed; refill is computed on access. In Redis this must be **atomic** (a Lua script or `INCR`+`EXPIRE`), or two concurrent requests both read the old count and over-admit. Sliding-window-log keeps a sorted set of timestamps and trims older than the window; sliding-window-counter blends the current and previous fixed windows by weight — cheaper, slightly approximate.

**Numbers an interviewer expects.**
- Config reads as `rate` + `cap`: e.g. **100 req/s sustained, burst 200** = refill 100/s, bucket cap 200.
- Redis `INCR`/Lua check: **sub-ms**, adding negligible latency to the request path.
- Fixed-window boundary flaw: a client can send `limit` at 0:59.9 and `limit` again at 1:00.0 → **2× the limit** in a ~0.2 s span. Sliding window removes this.

**Worked example.** Public API capped at 100 req/s per key, allowing short bursts to 200. Token bucket: cap 200, refill 100/s. A client idle for 2 s has a full bucket (200) and can fire a 200-request burst, then settles to 100/s as the bucket refills — exactly the "bursty but bounded" behaviour you want. A fixed-window counter would either reject the legitimate burst or leak a double-burst at the boundary.

**Common follow-ups**
- *Q: Where in the stack?* A: Coarse per-IP/per-key limits at the API gateway (cheap, protects everything behind it); fine-grained per-endpoint or per-tenant limits at the service using shared Redis state.
- *Q: How do you tell the client?* A: **429 Too Many Requests** with a `Retry-After` header and `X-RateLimit-Remaining`/`-Reset` so well-behaved clients back off instead of hammering.
- *Q: Redis is the limiter's bottleneck/SPOF?* A: Shard by key across a Redis cluster; on a Redis outage, **fail open** (allow) for availability or **fail closed** (reject) for protection — a deliberate choice. Local per-node buckets as a degraded fallback.
- *Q: Distributed accuracy vs cost?* A: Perfectly global counts need every request to touch shared state. To cut latency, give each node a local allowance synced periodically — approximate but far cheaper; name the accuracy/latency trade-off.
