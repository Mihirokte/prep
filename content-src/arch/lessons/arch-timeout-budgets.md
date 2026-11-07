---
id: arch-timeout-budgets
chapter: arch-cross-cutting
title: Timeout budgets
minutes: 3
---
Every call to a dependency needs an explicit timeout. And in a call chain — A calls B calls C — each hop's timeout must be shorter than the *remaining* budget of the hop that called it, so a slow leaf service doesn't make every caller up the chain wait the maximum possible time.

```flow
dir: LR
a: A budget 3s | step
b: B budget 2s | step
c: C budget 1s | step
a -> b : calls, 2s cap
b -> c : calls, 1s cap
```

The concrete failure this prevents: if A gives itself 3s but calls B with no timeout, and B calls a dead C, then A's threads pile up waiting on a call that will never return — exhausting A's pool for *unrelated* requests too. That is the single most common way one dependency's outage becomes everyone's outage.

The rule of thumb: at each hop, spend only a fraction of the budget you were given, and reserve the rest for the caller's own work and for a fallback. Timeouts are the first, cheapest line of defence — the one that circuit breakers and bulkheads build on top of. If a call can block, it needs a timeout, full stop.

```check
Q: Service A calls Service B, which in turn calls Service C. Service A is given an overall request budget of 3.0 seconds. Which configuration correctly follows timeout budget design?
- Set Service A's timeout to 4.0 seconds, Service B's timeout to 4.0 seconds, and Service C's timeout to 4.0 seconds so every service gets equal time.
* Set Service A's timeout to 3.0 seconds, Service B's timeout to 1.8 seconds, and Service C's timeout to 0.8 seconds.
- Set Service A's timeout to 2.0 seconds, Service B's timeout to 3.0 seconds, and Service C's timeout to 4.0 seconds so leaf dependencies have plenty of time to finish.
- Set timeouts only on Service C since only leaf services risk hanging when dead.
Why: Each hop's timeout must be strictly shorter than the remaining budget of the caller, reserving time for local work and fallback. Setting downstream timeouts equal to or larger than upstream budgets violates this rule, causing upstream callers to time out or exhaust resources while waiting for slow downstream calls. Omitting timeouts on intermediate callers also risks thread exhaustion across the system.
```

```recall
Q: Why must each hop's timeout be shorter than the remaining budget of its caller?
A: So a slow leaf cannot force every caller up the chain to wait its own maximum; the inner timeout fires first and returns control before the outer budget is exhausted.
Q: What concrete failure does a missing timeout on a dependency cause?
A: Threads pile up waiting on a call that may never return, exhausting the caller's thread pool and taking down unrelated requests too, so one dependency's outage becomes everyone's.
Q: Why are timeouts described as the foundation that circuit breakers and bulkheads build on?
A: They bound how long any single call can block; without that bound, breakers and bulkheads have nothing to measure or isolate against, so a blocking call still starves resources.
```
