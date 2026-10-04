---
id: arch-observability
chapter: arch-cross-cutting
title: Observability and OpenTelemetry
minutes: 4
---
The observability triad, and what each is *for*:
- **Logs** — discrete, timestamped event records; best for "what exactly happened at this point."
- **Metrics** — aggregated numeric time series (request rate, error rate, latency percentiles); best for "is the system healthy right now" and for alerting.
- **Traces** — the path of a single request across services, showing where time went at each hop; best for "why was *this* request slow" in a distributed system.

**OpenTelemetry (OTel) is the current standard**, and this is a genuinely recent, datable shift. All three signals — traces, metrics, and logs — reached GA in 2025 (logs lagged the other two for years), and OTel formally graduated as a CNCF project in 2026, described as "the de facto standard for open source observability" with the second-highest project velocity in the cloud-native ecosystem after Kubernetes.

**Why it matters practically:** OTel gives you one vendor-neutral instrumentation API across all three signals, plus a Collector that fans data out to whatever backend you use (Datadog, Grafana, Honeycomb, CloudWatch). Instrument with OTel semantic conventions rather than a vendor-proprietary agent where you have the choice — otherwise switching observability vendors later becomes a full re-instrumentation project.

```flow
dir: LR
app: Instrumented app | step
sdk: OTel SDK/API | step
col: OTel Collector | step
back1: Vendor A | store
back2: Vendor B | store
app -> sdk : logs/metrics/traces
sdk -> col : OTLP export
col -> back1 : fan out
col -> back2 : swap vendor
```

```recall
Q: Why reach for a trace rather than a metric when a single request is slow?
A: Metrics are aggregated time series that tell you the system's overall health, so they cannot explain one request; a trace shows that request's path across services and where time went at each hop.
Q: What does the OTel Collector buy you that a vendor agent does not?
A: One vendor-neutral instrumentation that fans data out to any backend, so switching observability vendors is a Collector config change rather than a full re-instrumentation project.
Q: When would you alert on a metric instead of on logs or traces?
A: For "is the system healthy right now" signals like error rate and latency percentiles; those are aggregate numeric series suited to thresholds, whereas logs and traces are for diagnosing a specific event after an alert fires.
```
