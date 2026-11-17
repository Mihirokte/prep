---
id: ops-health-probes
chapter: ops-release
title: Health checks: liveness and readiness
minutes: 4
---
An orchestrator and a load balancer need to know two *different* things about your instance, and conflating them causes outages.

- **Liveness** — "is this process alive, or is it wedged and needs a restart?" A failing liveness check tells Kubernetes to **kill and restart** the container. Use it for unrecoverable states like a deadlock.
- **Readiness** — "is this instance ready to *serve traffic right now*?" A failing readiness check tells the system to **stop sending requests** to this instance, but leave it running. Use it during startup (still loading a cache, warming a connection pool) or when a dependency is temporarily unavailable.

Why the distinction matters:

```mermaid
sequenceDiagram
    participant K8s as Orchestrator
    participant Pod
    participant LB as Load balancer
    K8s->>Pod: readiness probe
    Pod-->>K8s: 503 — still warming up
    K8s->>LB: keep this pod OUT of rotation
    Pod->>Pod: finishes warming
    K8s->>Pod: readiness probe
    Pod-->>K8s: 200 OK
    K8s->>LB: add pod to rotation
```

The classic mistake is using a liveness probe that checks a downstream dependency: when that dependency has a blip, *every* instance fails liveness, gets **restarted at once**, and you turn a small dependency hiccup into a full self-inflicted outage. Liveness = "am I healthy?"; readiness = "can I serve *right now*?"

```check
Q: A team is deploying a web service that queries a relational database. If the database experiences a brief network outage, the team wants to stop incoming user traffic without triggering orchestrator restarts across the entire fleet. How should they configure their health probes?
- Configure both liveness and readiness probes to check downstream database connectivity so unhealthy instances get restarted immediately.
- Point the readiness probe at a static in-memory flag and point the liveness probe at the downstream database so restarts clear deadlocks.
* Configure the readiness probe to verify the database connection while keeping the liveness probe scoped strictly to internal process health.
- Disable readiness checks and rely entirely on liveness probes to take the container out of rotation when the database is unavailable.
Why: Readiness probes remove the instance from traffic routing without killing the container when a dependency is temporarily unavailable. If liveness checked the database, every instance would fail liveness during a blip and restart simultaneously, converting a dependency hiccup into a full outage. Static flags or disabling readiness checks would allow traffic to hit instances that cannot serve.
```

```recall
Q: Why should a liveness probe not check a downstream dependency?
A: A blip in that dependency fails liveness on every instance at once, so the orchestrator restarts the whole fleet simultaneously and turns a small hiccup into a self-inflicted outage.
Q: An instance is still warming its cache. Which probe should fail, and what happens?
A: Readiness should fail. The load balancer takes the pod out of rotation but leaves it running, so no traffic is sent until it reports ready.
Q: What goes wrong if you only have a liveness probe and no readiness probe?
A: Traffic is routed to instances that are up but not yet able to serve, so users hit errors during startup or while a dependency is temporarily unavailable.
Q: When is killing and restarting the container the right response?
A: For unrecoverable states like a deadlock, where the process is wedged and only a restart recovers it. That is what liveness is for.
```
