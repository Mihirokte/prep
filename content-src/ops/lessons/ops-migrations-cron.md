---
id: ops-migrations-cron
chapter: ops-release
title: Database migrations and scheduled jobs
minutes: 5
---
Two operational tasks that quietly cause outages when done naively.

**Database migrations and schema versioning.** Your schema evolves — new columns, new tables, changed types — and those changes must be **versioned, ordered, and repeatable**, exactly like code. Migration tools apply numbered scripts in sequence and track which have run, so every environment converges to the same schema.

The hard part is applying a migration to a live system without downtime, especially since a deploy may need to **roll back**. The rule is **expand, then contract**:

1. **Expand** — make an additive, backward-compatible change (add the new column). Old and new code both still work.
2. **Migrate** — deploy code that writes to both old and new, backfill data.
3. **Contract** — only after the new code is stable everywhere, remove the old column.

A destructive change in one step (rename or drop a column the running code still uses) breaks either the old version during rollout or the new version on rollback.

```steps
Expand | Make an additive, backward-compatible change like adding the new column; old and new code both work
Dual-write | Deploy code that writes to both old and new locations
Backfill | Copy existing data into the new column so it is complete
Verify | Confirm the new code is stable everywhere before removing anything
Contract | Only now remove the old column, since no running code depends on it
```

**Cron jobs / scheduled tasks.** Recurring work — nightly reports, cleanup, billing runs — needs three properties people forget: **idempotency** (a job that runs twice, because of a retry or overlap, must not double-charge or double-send), **monitoring** (a silent cron that stops firing is invisible until something downstream is missing — alert on *absence* of the expected run), and **overlap handling** (decide what happens if a run starts before the previous one finished).

```recall
Q: Why does a one-step rename or drop break a zero-downtime deploy?
A: During rollout old and new code run together, and a rollback may revert to the old code. A destructive change breaks whichever version still expects the removed column, so it must be split into expand then contract.
Q: Why must the contract step wait until the new code is stable everywhere?
A: Removing the old column while any running code or a possible rollback still reads it would break that code. Waiting until the new code is stable removes the last dependency on the old column.
Q: Why must a cron job be idempotent?
A: Retries or overlapping runs can execute it more than once. Without idempotency that could double-charge or double-send, so running twice must produce the same result as running once.
Q: Why alert on the absence of a scheduled run?
A: A silent cron that stops firing is invisible until something downstream is missing. Alerting on a missing expected run catches the failure before the gap causes damage.
```
