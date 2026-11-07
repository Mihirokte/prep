---
id: ops-latency-tail
chapter: ops-observability
title: Latency, throughput, and tail (P99)
minutes: 4
---
Two different performance questions, and the statistic that separates good engineers from ones who quote averages.

- **Latency** — how long *one* request takes (a duration).
- **Throughput** — how many requests you handle *per unit time* (a rate, e.g. QPS).

They trade off: pushing throughput toward saturation causes queuing, which drives latency up sharply. You optimize for one or the other depending on the workload (an interactive API cares about latency; a batch pipeline cares about throughput).

The crucial move on latency is to **stop looking at the average**. The mean hides pain: if 1 in 100 requests takes 5 seconds and the rest take 20 ms, the average looks fine while some users have a terrible experience. So measure **percentiles**:

```bars
title: Why the average hides tail pain (illustrative)
unit: ms
P50 typical request | 20
Slow 1 in 100 request | 5000
```

- **P50 (median)** — the typical experience.
- **P99 / P99.9 — tail latency** — the slowest 1% / 0.1%. This is where timeouts, retries, and angry users live.

Tail latency matters more than it seems because of **fan-out**: if one user action makes 100 internal calls in parallel and waits for all of them, the odds that *at least one* hits the slow P99 are high — so your user-facing latency is effectively governed by your backend's *tail*, not its median. Set SLOs and alerts on the tail, not the average.

```check
Q: An API gateway executes 50 parallel backend queries to gather data for a single user dashboard request and waits for all 50 to complete before responding. The backend service has a P50 latency of 20 ms, an average latency of 25 ms, and a P99 latency of 400 ms. How will the user-facing latency of the dashboard behave?
- The gateway will complete in around 15 ms because the mean latency remains low across requests.
- The gateway will complete in around 20 ms because P50 represents the typical experience of the backend instances.
* The gateway will frequently take 400 ms or more because fan-out makes hitting at least one slow tail backend likely.
- The gateway will time out every request because backend saturation causes all 50 shards to queue simultaneously.
Why: Waiting on 50 concurrent requests causes fan-out, meaning the user experience is dominated by the slowest dependency rather than the typical 20 ms median. Assuming the gateway will finish in 15-20 ms overlooks the fact that a single request hitting the tail delays the entire aggregated response.
```

```recall
Q: Why do latency and throughput trade off near saturation?
A: Pushing throughput toward saturation causes requests to queue, and queuing drives latency up sharply, so you optimize for one or the other depending on the workload.
Q: Why is the average latency a misleading number?
A: The mean hides the tail. If 1 in 100 requests takes 5 seconds and the rest take 20 ms, the average still looks fine while a slice of users has a terrible experience.
Q: Why does fan-out make tail latency govern user-facing latency?
A: If one action makes many parallel calls and waits for all, the chance that at least one hits the slow P99 is high, so the slowest hop sets the response time, not the median.
Q: For an interactive API versus a batch pipeline, which metric do you optimize?
A: An interactive API optimizes latency (per-request duration); a batch pipeline optimizes throughput (requests per unit time), because that is what each workload is judged on.
```
