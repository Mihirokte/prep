---
id: ops-autoscaling
chapter: ops-release
title: Autoscaling: horizontal vs vertical
minutes: 4
---
Load isn't constant, so capacity shouldn't be either. Autoscaling adjusts resources to match demand — saving money at the trough and preventing meltdown at the peak.

Two axes:

- **Vertical scaling (scale up)** — give one instance more CPU/RAM. Simple, no distribution needed, but bounded by the biggest machine you can buy, and resizing usually means downtime or a restart.
- **Horizontal scaling (scale out)** — add more instances behind a load balancer. This is the cloud-native default: near-limitless headroom and fault tolerance (one instance dies, others carry on). The requirement it imposes is that instances be **stateless**, so any request can hit any instance.

**Horizontal autoscaling** watches a signal — CPU, request rate, queue depth — and adds or removes instances to keep it near a target.

```flow
dir: LR
signal: Watch signal | store
target: Compare to target | gate
up: Add instances | step
down: Remove instances | step
warm: Warm-up time | gate
lb: Load balancer | store
signal -> target : CPU, queue depth
target -> up : above target
target -> down : below target
up -> warm : wait to be ready
warm -> lb : join rotation
down -> lb : leave rotation
``` Two cautions: scale on the metric that actually reflects *your* bottleneck (a queue-backed worker should scale on queue depth, not CPU), and account for **warm-up time** — if a new instance takes 90 seconds to be ready, you must scale *ahead* of the load, not after it has already arrived.

```recall
Q: Why is horizontal scaling the cloud-native default over vertical?
A: It offers near-limitless headroom and fault tolerance, since one instance dying leaves others serving. Vertical scaling is bounded by the biggest machine and usually needs downtime to resize.
Q: What requirement does horizontal scaling impose on instances?
A: They must be stateless, so any request can hit any instance behind the load balancer. State kept in one instance would break when requests are spread across many.
Q: Why should a queue-backed worker scale on queue depth, not CPU?
A: You must scale on the metric that reflects the real bottleneck. A worker can be backlogged with a deep queue while CPU looks fine, so CPU would miss the overload.
Q: Why account for warm-up time when autoscaling?
A: If a new instance takes, say, 90 seconds to be ready, scaling only after load arrives leaves you overwhelmed during warm-up. You must scale ahead of the load.
```
