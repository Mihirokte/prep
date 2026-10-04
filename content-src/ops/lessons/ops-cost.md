---
id: ops-cost
chapter: ops-resilience
title: Cost optimization
minutes: 4
---
In the cloud, architecture decisions are spending decisions — every running resource has a meter. Cost optimization is treating money as a first-class operational metric, alongside latency and reliability, rather than a surprise on the monthly bill.

```flow
dir: LR
idle: Idle, over-provisioned | store
model: Wrong purchasing model | store
storage: Hot data on fast tier | store
egress: Cross-region egress | store
visible: Tag and dashboard spend | gate
cut: Lower bill | step
idle -> cut : right-size, autoscale
model -> cut : reserved, spot
storage -> cut : tier cold data
egress -> cut : cut transfer
visible -> cut : attribute spend
```

Where the waste usually hides:

- **Idle and over-provisioned resources** — instances sized for a peak that rarely comes, or left running with nothing to do. **Right-sizing** (match capacity to actual usage) and **autoscaling** (shed capacity at the trough) recover most of this.
- **The right purchasing model** — on-demand for spiky/unpredictable load, reserved or committed-use pricing for steady baseline load (big discount for a commitment), and spot/preemptible instances for fault-tolerant, interruptible work (deep discount, can be reclaimed).
- **Storage tiering** — hot data on fast expensive storage, cold/archival data on cheap slow tiers, with lifecycle rules that move it automatically.
- **Data transfer** — cross-region and egress traffic is often a silently large line item.

The discipline that makes it stick is **visibility**: tag resources by team/service so cost is attributable, and put spend on a dashboard people actually look at. You can't optimize a bill you can't attribute. The trade-off is always cost *versus* performance and resilience — cheaper is a valid choice only when you've named what reliability you're giving up.

```recall
Q: Which purchasing model fits steady baseline load, and why?
A: Reserved or committed-use pricing. You trade a usage commitment for a large discount, which pays off precisely because the baseline load is predictable and always present.
Q: When are spot/preemptible instances the right choice?
A: For fault-tolerant, interruptible work. They are deeply discounted but can be reclaimed, so only workloads that tolerate being killed mid-run should use them.
Q: Why is visibility the discipline that makes cost optimization stick?
A: You cannot optimize a bill you cannot attribute. Tagging resources by team or service and surfacing spend on a dashboard makes waste visible and gives it an owner.
Q: What must you name before choosing the cheaper option?
A: The reliability or performance you are giving up. Cost always trades against those, so a cheaper choice is only valid once that tradeoff is explicit.
```
