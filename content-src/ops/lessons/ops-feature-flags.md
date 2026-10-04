---
id: ops-feature-flags
chapter: ops-release
title: Feature flags: decoupling deploy from release
minutes: 4
---
A feature flag is a runtime switch that decides whether a piece of behaviour is active — without a redeploy. Its deepest value is **separating deployment from release**: you can ship code to production with the feature turned off, then turn it on for users when you (or product) choose. Deploy becomes a low-risk technical event; release becomes a business decision.

```flow
dir: LR
deploy: Deploy code, flag off | step
prod: In production, dark | store
flag: Feature flag | gate
on: Release to users | step
kill: Flip off, kill switch | gate
deploy -> prod : ship
prod -> flag : evaluated at runtime
flag -> on : turn on, 1% to 100%
on -> kill : misbehaves
kill -> prod : feature dark again
```

What that unlocks:

- **Progressive rollout** — enable a feature for 1% → 10% → 100% of users, or for internal staff first, watching metrics as you widen.
- **A kill switch** — if a new feature misbehaves, flip it off in seconds instead of rushing an emergency rollback.
- **Trunk-based development** — merge incomplete work behind an off flag, avoiding long-lived branches and painful merges.

The discipline flags demand: they are **temporary debt**. Every flag is a branch in your code and a state to test. Remove a flag once its feature is fully rolled out and stable, or you accumulate a maze of dead conditionals and combinatorial test paths that nobody dares delete.

```recall
Q: What is the core thing a feature flag decouples, and why does it matter?
A: It decouples deployment from release. Code can ship to production turned off, so deploy is a low-risk technical event while turning the feature on becomes a business decision made when ready.
Q: Why is a kill switch preferable to an emergency rollback?
A: Flipping a flag off disables the bad behavior in seconds without a redeploy, whereas an emergency rollback is slower and riskier under pressure.
Q: How do flags enable trunk-based development?
A: Incomplete work can be merged behind an off flag, so there are no long-lived branches and the painful merges they cause are avoided.
Q: Why are flags described as temporary debt?
A: Each flag is a branch in the code and extra state to test, multiplying combinatorial test paths. Left in after rollout they become dead conditionals nobody dares delete, so they must be removed once stable.
```
