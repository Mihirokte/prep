---
id: ops-slo-sli
chapter: ops-observability
title: SLIs, SLOs, and error budgets
minutes: 6
---
This is the framework (from Google's SRE practice) that turns "reliable" from a vibe into a number you can manage.

- **SLI — Service Level Indicator.** A *measured* quantity of your service's behaviour: e.g. the proportion of requests served successfully in under 300 ms. It's the raw signal.
- **SLO — Service Level Objective.** Your *target* for an SLI over a window: e.g. "99.9% of requests succeed under 300 ms, measured over 28 days." This is an internal goal you hold yourselves to.
- **SLA — Service Level Agreement.** A *contract* with customers, with financial consequences if breached. Your SLO should be **stricter** than your SLA, so you notice trouble before a customer can invoke the contract.

The powerful idea is the **error budget**. If your SLO is 99.9% success, then 0.1% of requests are *allowed* to fail — that 0.1% is a budget you get to spend:

- **Budget remaining** → you can take risks: ship features faster, run experiments, do a bold migration.
- **Budget exhausted** → you stop shipping risky changes and spend engineering effort on reliability until you're back in budget.

```flow
dir: LR
sli: Measure SLI | store
slo: Compare to SLO | gate
budget: Error budget | store
ship: Ship features, take risks | step
freeze: Freeze risky changes | gate
sli -> slo : success ratio
slo -> budget : spend or remaining
budget -> ship : budget remaining
budget -> freeze : budget exhausted
freeze -> sli : fix reliability
ship -> sli : keep measuring
```

This dissolves the classic dev-vs-ops fight ("ship faster" vs "stay stable") into a shared, data-driven rule. 100% reliability is the wrong target — it's impossible, ruinously expensive, and users can't tell the difference between 99.9% and 100% anyway. The error budget makes the *right* amount of unreliability an explicit, spendable resource.

```recall
Q: Why should your SLO be stricter than your SLA?
A: So you notice and react to trouble before a customer can invoke the contract. The SLA has financial consequences; the tighter internal SLO gives you headroom to fix things first.
Q: What does the team do differently when the error budget is exhausted versus remaining?
A: With budget remaining they can take risks: ship faster, run experiments, do bold migrations. When it is exhausted they freeze risky changes and spend effort on reliability until back in budget.
Q: Why is 100% reliability the wrong target?
A: It is impossible and ruinously expensive, and users cannot tell 99.9% from 100%. The error budget names the right amount of unreliability instead of chasing a target with no payoff.
Q: How does the error budget resolve the dev-versus-ops conflict?
A: It replaces "ship faster" versus "stay stable" with a shared, data-driven rule: budget remaining permits risk, budget spent forces a reliability focus.
```
