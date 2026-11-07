---
id: ops-capacity-load
chapter: ops-observability
title: Capacity planning and load tests
minutes: 3
---
Capacity is the amount of useful work a system can complete while meeting its reliability target. A load test is valuable only when traffic shape, data, dependencies, and pass criteria resemble the decision being made. Maximum requests per second by itself is not a capacity plan.

## Model the work

Start with arrival rate, service time, request mix, and per-request resource cost. Little's Law gives a useful check: average concurrency is arrival rate multiplied by average time in the system. At 8,000 requests per second and 100 ms, roughly 800 requests are in flight before headroom.

```stack
title: Illustrative peak capacity budget
unit: percent
Expected peak | 55 | forecast demand
Failure headroom | 20 | one host or zone lost
Traffic error | 10 | forecast uncertainty
Operational reserve | 15 | deploys and recovery
```

Choose headroom from failure requirements, not habit. If the service must survive losing one of three zones, normal operation cannot consume nearly all fleet capacity.

## Build a representative test

Use the real endpoint mix, payload sizes, authentication path, cache-hit ratio, and data cardinality. Warm-cache-only tests hide database load; tiny datasets hide index and partition behavior. Stub an external dependency only when the decision excludes it, and then inject realistic latency and errors.

```steps
Define pass criteria | Set SLO error and saturation limits before testing
Calibrate one instance | Measure service time and resource cost by request type
Ramp gradually | Hold each level long enough to reach steady state
Cross expected peak | Include headroom and a controlled overload stage
Observe recovery | Verify scaling backpressure and queue drain behavior
Record the envelope | Publish safe throughput and the first limiting resource
```

```check
Q: An engineering team is designing a load test to verify if their e-commerce checkout service can handle upcoming Black Friday traffic. Which testing approach best follows sound capacity planning principles?
- Rely on an in-memory test cache so the load generator can hit the target RPS without throttling.
* Include realistic database query distributions and cache misses to reflect downstream stress.
- Scale the load until the web tier crashes completely to find the absolute maximum RPS.
- Mock all external dependencies with zero-latency responses to isolate service logic.
Why: Representative testing requires realistic cache-hit ratios and request distributions, because warm caches conceal the downstream database load that real traffic creates. A tempting mistake is maximizing request rate by artificially keeping caches warm or isolating tiers with zero-latency stubs, but that fails to reveal real bottlenecks and overstates safe capacity.
```

## Find the knee safely

As load rises, throughput initially grows with arrivals. Near saturation, latency bends upward, queues grow, and throughput stops increasing. That knee is more useful than the final crash point. Stop at safety guardrails and protect shared environments from test traffic.

Test overload behavior explicitly. A bounded queue and fast rejection may preserve the core service; an unbounded queue makes every request slow and can exhaust memory. Autoscaling must be tested over a long enough window to include metric delay, provisioning, cold start, and stabilization.

## Report a decision

State the tested configuration, safe envelope, bottleneck, headroom, and assumptions. For example: this fleet sustains the expected mix at the target p99 through 10,000 rps; database connection wait is the first limit; loss of one zone leaves 25 percent reserve. That supports a scaling or launch decision. A chart without a decision does not.

```recall
Q: What does Little's Law estimate for a service?
A: Average concurrency as arrival rate multiplied by average time in the system.
Q: Why can a warm-cache load test be misleading?
A: It hides database and downstream work that real cache misses create, overstating safe capacity.
Q: What is the knee of a load curve?
A: The point where latency and queues rise sharply while additional arrivals produce little useful throughput.
Q: Why test beyond expected peak?
A: To verify headroom, scaling, rejection, backpressure, and recovery rather than only the normal path.
```
