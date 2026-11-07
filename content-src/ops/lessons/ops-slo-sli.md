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

```check
Q: A team maintains a service with a 28-day SLO of 99.9% availability, and their contract SLA is 99.5%. At day 20, monitoring indicates that only 0.02% of requests have failed so far during the period. What should the engineering team do next according to error budget practices?
- Freeze all production deployments and dedicate engineering effort strictly to infrastructure reliability.
* Continue shipping new product features and running scheduled experimental migrations.
- Immediately revise the SLO target downward to 99.0% to restore buffer.
- Trigger financial compensation credits to all affected enterprise customers.
Why: Because only 0.02% has failed out of the allowed 0.1% budget, significant error budget remains, permitting the team to take risks and ship features. Freezing changes is only triggered when the error budget is exhausted, and financial penalties only apply if the looser SLA is breached.
```

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
