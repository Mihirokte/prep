---
id: arch-feature-flags
chapter: arch-cross-cutting
title: Feature flags
minutes: 3
---
Feature flags **decouple deploy from release**. You ship code to production dark, then turn it on for a subset of traffic — internal users, a percentage rollout, a specific tenant — independent of the deploy pipeline. This splits "did the deploy work" and "was the feature a good idea" into two separable questions instead of one high-stakes moment.

```flow
dir: LR
deploy: Deploy dark | step
flag: Flag off | gate
intl: Internal users | step
pct: 1 to 100 percent | step
all: Full release | store
deploy -> flag : code in prod
flag -> intl : enable subset
intl -> pct : ramp
pct -> all : if healthy
pct --> flag : kill switch off
```

**Patterns:**
- **Boolean kill-switch** — the fastest rollback path; flip a feature off without a redeploy if something goes wrong.
- **Percentage rollout** — ramp from 1% to 100% while watching metrics.
- **Targeting rules** — by user attribute, tenant, or region.
- **Multi-variate flags** — for A/B experimentation.

**Risks.** The main one is **flag debt**: flags that outlive their purpose and never get cleaned up, leaving dead conditional branches and a combinatorial testing surface. The other is using a flag as a permanent substitute for a real rollback path — a flag is a *temporary* decoupling mechanism, not a substitute for deploy hygiene. Give every flag an owner and an expiry.

```recall
Q: What two questions does decoupling deploy from release let you ask separately?
A: "Did the deploy work" and "was the feature a good idea"; the code ships dark first, so a deploy problem and a feature problem no longer collapse into one high-stakes moment.
Q: Why is a boolean kill-switch the fastest rollback path?
A: It turns a feature off without a redeploy, so you recover in seconds by flipping a flag instead of waiting for a pipeline to ship the previous build.
Q: What is flag debt and how do you prevent it?
A: Flags that outlive their purpose, leaving dead branches and a combinatorial test surface; prevent it by giving every flag an owner and an expiry so stale flags get removed.
```
