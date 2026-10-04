---
id: ops-iac-terraform
chapter: ops-delivery
title: Infrastructure as Code and Terraform
minutes: 5
---
Infrastructure as Code (IaC) means your servers, networks, databases, and DNS are defined in **version-controlled files**, not clicked into existence in a console. The payoff: infrastructure becomes reviewable, repeatable, and recoverable. You can stand up an identical environment from scratch, diff a proposed change before it happens, and roll back by reverting a commit.

**Terraform** is the common declarative tool. You describe the desired end state; Terraform figures out the create/update/delete actions to reach it:

- **`terraform plan`** shows exactly what will change before anything happens — the single most valuable habit, because it turns "hope this works" into a reviewable diff.
- **`terraform apply`** executes that plan.
- **State file** — Terraform records what it currently manages so it knows the delta next time. This state is shared and must live in a locked remote backend (not on one laptop), or two engineers applying at once will corrupt it.

```steps
Write | Describe the desired end state in version-controlled config files
Plan | Run terraform plan to see the exact create, update, delete diff before anything happens
Review | Treat the plan as a reviewable diff and approve it like code
Apply | Run terraform apply to execute the planned changes
Record state | Terraform updates the locked remote state so it knows the delta next time
```

Two disciplines separate mature IaC from a mess: prefer **immutable infrastructure** (replace servers rather than mutating them in place, so drift can't accumulate) and never make **out-of-band manual changes** — a console edit that Terraform doesn't know about causes confusing "drift" the next plan tries to undo.

```recall
Q: Why is terraform plan called the single most valuable habit?
A: It shows exactly what will create, update, or delete before anything happens, turning "hope this works" into a reviewable diff you can approve like code.
Q: Why must the state file live in a locked remote backend?
A: State records what Terraform currently manages so it can compute the delta. If it sits on one laptop, two engineers applying at once corrupt it, so a shared locked backend serializes changes.
Q: What problem do out-of-band manual changes cause?
A: A console edit Terraform does not know about creates drift. The next plan sees a mismatch and tries to undo the manual change, producing confusing and unwanted diffs.
Q: Why prefer immutable infrastructure over mutating servers in place?
A: Replacing servers rather than editing them stops configuration drift from accumulating, so every instance matches its declared definition and environments stay reproducible.
```
