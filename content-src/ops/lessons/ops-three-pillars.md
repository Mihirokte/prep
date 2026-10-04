---
id: ops-three-pillars
chapter: ops-observability
title: Metrics, logs, and the three pillars
minutes: 5
---
You cannot operate what you cannot see. **Observability** is the property of being able to ask *new* questions about your system's behaviour from the outside, without shipping new code to answer them. It rests on three complementary signals — the "three pillars."

- **Metrics** — numeric measurements aggregated over time: request rate, error rate, latency, CPU, queue depth. Cheap to store, ideal for dashboards and alerts, and they answer *"is something wrong, and how bad?"* But they're aggregates — they lose per-request detail.
- **Logs** — timestamped records of discrete events, ideally **structured** (JSON with fields, not free-text) so you can search and filter them. They answer *"what exactly happened for this request/user?"* Powerful but voluminous and costly at scale, so sample and set retention deliberately.
- **Traces** — the path of a single request across services (next lesson). They answer *"where did the time go / where did it fail?"*

```flow
dir: LR
sys: System behaviour | store
metrics: Metrics | store
logs: Logs | store
traces: Traces | store
what: Is something wrong | gate
why: What happened here | gate
where: Where did it fail | gate
sys -> metrics : aggregate numbers
sys -> logs : discrete events
sys -> traces : request path
metrics -> what : how bad
logs -> why : per-request detail
traces -> where : slow or failing hop
```

The distinction that matters: **monitoring** is watching known signals for known failure modes (dashboards, thresholds); **observability** is having enough rich, correlated data to debug problems you *didn't* anticipate. Metrics tell you the *what*; logs and traces let you find the *why*. A useful default is Google's "Four Golden Signals" to instrument first: **latency, traffic, errors, and saturation**.

```recall
Q: What distinguishes observability from monitoring?
A: Monitoring watches known signals for known failure modes via dashboards and thresholds. Observability means having rich correlated data to ask new questions and debug problems you did not anticipate, without shipping new code.
Q: When do you reach for logs instead of metrics?
A: When you need per-request detail: exactly what happened for one request or user. Metrics are aggregates and lose that detail, so they tell you something is wrong but not the specifics.
Q: Why sample logs and set retention deliberately?
A: Logs are voluminous and costly at scale, so keeping everything forever is expensive. Sampling and deliberate retention control cost while preserving enough detail to debug.
Q: Which question does each pillar answer?
A: Metrics answer whether something is wrong and how bad; logs answer what exactly happened for a request; traces answer where across services the time went or the failure occurred.
```
