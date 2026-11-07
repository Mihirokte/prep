---
id: ops-alerting
chapter: ops-observability
title: Alerting: paging on symptoms, not causes
minutes: 4
---
An alert's job is to get a human's attention when — and *only* when — action is genuinely needed. The failure mode isn't too few alerts; it's too many. **Alert fatigue** is when so many alerts fire (many noisy or non-actionable) that on-call engineers start ignoring them, and the one that mattered is lost in the noise.

Principles for alerts worth waking someone for:

- **Alert on symptoms, not causes.** Page on *"users are seeing errors / latency is above the SLO,"* not on *"CPU is at 90%."* High CPU may be totally fine; a served-error rate is what actually hurts users. Cause-based alerts fire constantly and often don't correspond to real user pain.
- **Every page must be actionable.** If the recipient can't do anything about it right now, it shouldn't page — make it a ticket or a dashboard, not a 3 a.m. wake-up.
- **Tie alerts to your SLOs (next lesson).** The strongest signal to page on is *"we are burning our error budget fast enough to breach the objective."*
- **Use severity tiers.** A page (immediate human action) is different from a ticket (handle during business hours) is different from an FYI. Route them differently.

The test for any alert: *"if this fires and the human does nothing, was that the right outcome?"* If yes often enough, delete or downgrade it.

```flow
dir: TB
cond: Condition fires | step
symptom: Hurts users now | gate
actionable: Human can act now | gate
page: Page on-call | step
ticket: Make a ticket | step
drop: Delete or downgrade | gate
cond -> symptom : evaluate
symptom -> drop : no user pain
symptom -> actionable : user pain
actionable -> ticket : act later
actionable -> page : act now
```

```check
Q: A platform team is redesigning their alerting rules to reduce alert fatigue. Which of the following alerting rules should be configured to immediately page the on-call engineer at night?
- Page the on-call engineer whenever an internal database instance reaches 92% CPU utilization for two minutes.
- Page the on-call engineer whenever an automated nightly backup fails to complete.
* Page the on-call engineer when user-facing checkout error rates breach the service level objective.
- Page the on-call engineer whenever a background job discovers that a customer invoice PDF cannot be generated until business hours.
Why: Alerts that wake someone up should focus on symptoms affecting users that require immediate human action, such as user error rates breaching an SLO. High CPU is a cause metric that often causes alert fatigue without hurting users, while non-urgent background tasks should be routed as tickets.
```

```recall
Q: Why alert on symptoms rather than causes?
A: Symptoms like a served-error rate above the SLO reflect real user pain, while causes like 90% CPU may be harmless. Cause-based alerts fire constantly and often do not correspond to anyone being hurt.
Q: What is alert fatigue and why is it the dangerous failure mode?
A: It is when so many noisy or non-actionable alerts fire that on-call starts ignoring them, so the one that mattered is lost in the noise. Too many alerts is worse than too few.
Q: What test decides whether a condition should page?
A: If it fires and the human does nothing, was that the right outcome? If doing nothing is often fine, the alert is not actionable and should be deleted or downgraded to a ticket or dashboard.
Q: Why is burning the error budget fast the strongest thing to page on?
A: It ties the page directly to the risk of breaching the objective users care about, so it fires on genuine, SLO-relevant danger rather than on an internal metric that may not matter.
```
