---
id: sd-what-is-measured
chapter: sd-interview
title: What an SDE2 round measures
minutes: 4
---
System design rounds are no longer senior-only. By late 2025 they show up in most SDE2 / L4 loops. The good news: the bar is bounded. You are judged as a strong individual contributor, not an architect.

Evan King (Hello Interview) frames the level along three axes:

- **Breadth** — wide but shallow is fine. You are not assumed to know every technology. If you name-drop an "API gateway," expect "what does that actually do?" — so only draw boxes you can explain.
- **Depth** — limited depth is acceptable. Textbook understanding of concepts is enough; you are transitioning from book knowledge to applied use.
- **Proactiveness** — *you* drive requirements, API, schema, and the first high-level design. It is normal for the interviewer to steer the deep-dive and point out weaknesses.

The mid-level scope is a **single service or feature**, a known scaling range (say 100 → 10K QPS), correct fundamentals, and honest trade-off reasoning. You are **not** penalised for skipping multi-region, global rollout, or cost optimisation unless you brought it up yourself.

```flow
dir: LR
breadth: Breadth: wide, shallow | step
depth: Depth: textbook ok | step
proact: Proactiveness: you drive | step
bar: SDE2 / L4 bar | gate
breadth -> bar
depth -> bar
proact -> bar
```

The most common way mid-level candidates fail is not a knowledge gap — it is **structure**: going too deep too early and running out of time.

```recall
Q: You name an API gateway in your design. What should you expect next, and what does that imply?
A: Expect "what does that actually do?" Breadth is judged shallow but real, so only draw boxes you can explain. Name-dropping a component you cannot explain hurts more than omitting it.
Q: Whose job is it to drive requirements, API, and the first high-level design at SDE2?
A: Yours. Proactiveness is one of the three axes: you drive the structure, and it is normal for the interviewer to steer the deep-dive and point out weaknesses.
Q: Are you penalized for not covering multi-region or cost optimization?
A: Not unless you raised it yourself. The mid-level scope is a single service or feature at a known scaling range, so skipping global rollout is fine if you did not open that door.
Q: What is the most common way mid-level candidates fail, and why?
A: Structure, not a knowledge gap. Going too deep too early burns the clock and leaves the design incomplete, which reads worse than broad coverage at bounded depth.
```
