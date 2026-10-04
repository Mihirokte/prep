---
id: arch-deployment-patterns
chapter: arch-cross-cutting
title: Blue-green, canary, and rolling
minutes: 4
---
Three ways to ship a new version without a hard cutover:

- **Rolling deployment** — replace old instances with new ones gradually, a few at a time. Simple, but both versions run at once during the rollout, so your API and data must tolerate both simultaneously.
- **Blue-green** — run two full, identical production environments (blue = current live, green = new), and switch all traffic at the router level at once. Rollback is instant (flip back to blue), but you need double the infrastructure during the switch, and any shared stateful resource (the database) still needs its own compatibility story.
- **Canary** — release the new version to a small slice of real traffic first, watch key metrics (error rate, latency), then progressively widen the slice if healthy or roll back fast if not. Lowest blast radius, at the cost of needing good real-time observability to detect a bad canary before it is fully out.

```flow
dir: LR
traffic: Live traffic | actor
router: Router split | gate
old: Old version | store
canary: Canary new | store
metrics: Watch metrics | gate
traffic -> router
router -> old : most traffic
router -> canary : small slice
canary -> metrics
metrics -> router : healthy, widen
metrics --> old : bad, roll back
```

**The common thread:** none of these are safe without the observability to detect a problem quickly (the OTel section) and the resilience patterns — timeouts, circuit breakers — to contain a problem's blast radius while you roll back. These are not independent topics; they compose into one story about shipping safely.

```recall
Q: What makes blue-green rollback instant, and what does it cost?
A: Both full environments run in parallel, so you flip the router back to blue immediately; the cost is double the infrastructure during the switch plus a compatibility story for any shared stateful resource like the database.
Q: Why does a canary have the lowest blast radius of the three?
A: It exposes only a small slice of real traffic to the new version while you watch metrics, so a bad release harms few users and can be rolled back before it is fully out.
Q: What must be true of your API and data during a rolling deployment?
A: Both versions run at once during the rollout, so the API contract and data schema must tolerate old and new instances simultaneously.
Q: Why are these patterns unsafe without observability and resilience patterns?
A: You need metrics to detect a bad release quickly and timeouts/circuit breakers to contain its blast radius while you roll back; without them a gradual rollout just spreads the failure slowly.
```
