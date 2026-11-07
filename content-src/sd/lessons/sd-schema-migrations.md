---
id: sd-schema-migrations
chapter: sd-data-at-scale
title: Zero downtime schema migrations
minutes: 3
---
A schema migration is a distributed compatibility problem because old code, new code, primary data, replicas, caches, and background jobs overlap. The reliable pattern is expand, migrate, contract. Each phase is reversible until the destructive step is deliberately accepted.

```check
Q: Your team needs to rename a user column from old_name to full_name on a high-traffic production table without causing downtime or breaking active application replicas. What is the correct sequence of steps?
- Perform a single atomic deployment that alters the table to drop old_name and creates full_name
* Expand by adding full_name, dual-write to both, backfill historical rows, validate equivalence, switch reads to full_name, and contract by dropping old_name
- Immediately switch all application reads to full_name and run a background script to rename the column in place
- Backfill all historical rows into full_name in a single large UPDATE query during peak hours to finish quickly
Why: Following expand-migrate-contract allows old and new application versions to coexist and maintain rollback safety throughout the transition before any destructive change. Doing the migration in a single deployment or dropping the column prematurely breaks older running binaries or prevents safe rollback. Backfilling in one giant update causes locks and replica lag rather than throttled, resumable batches.
```

## Expand before switching

Add the new column, table, index, or event field without removing the old representation. Prefer additive changes that both application versions can tolerate. Deploy code that understands both formats. If dual writes are required, define which representation is authoritative and how divergence is measured.

```steps
Expand | Add backward compatible schema without changing reads
Dual write | Populate old and new forms with an explicit source of truth
Backfill | Migrate historical rows in resumable throttled batches
Validate | Compare counts checksums and business invariants
Switch reads | Move behind a flag and observe real traffic
Contract | Remove the old form after rollback is no longer required
```

A dangerous migration combines these phases in one deployment. If the new binary fails after the old column was dropped, rollback cannot start. Separating states preserves an escape route.

## Backfill without becoming an incident

Large updates create locks, write amplification, replica lag, cache churn, and noisy-neighbor load. Process stable key ranges in small batches. Store a checkpoint so the job resumes rather than starts over. Rate-limit against production signals such as database CPU, lock wait, replication lag, and application p99.

Do not paginate a changing table with a huge offset. Use a stable cursor such as the primary key. Make the update idempotent so retrying a batch is harmless.

```flow
dir: LR
job: Backfill worker | step
primary: Primary database | store
replica: Read replica | store
guard: Load guardrails | gate
checkpoint: Checkpoint | store
job -> guard : may run
guard -> primary : small batch
primary --> replica : replicate
job -> checkpoint : last key
replica --> guard : lag signal
```

## Validate the meaning

Row counts are weak evidence. Validate business invariants: every order has one valid state, sums match across old and new representations, foreign keys resolve, and a sampled read returns equivalent results. Record difference counters during dual write and alert before the read switch.

## Know the rollback boundary

Before contract, rollback usually means switch reads back and redeploy the old-compatible binary. After old data is deleted, rollback may require restore or forward repair. Keep the compatibility window long enough to cover canary observation, queued work, delayed consumers, and the oldest binary that can still run.

```recall
Q: Why is expand-migrate-contract safer than one migration deployment?
A: Old and new versions remain compatible during the transition, so each phase can be observed and reversed before destructive contraction.
Q: What makes a backfill resumable?
A: Stable key-range batches, an external checkpoint, and idempotent updates that are safe to retry.
Q: Why are matching row counts insufficient validation?
A: The same number of rows can still encode different or invalid business meaning, so invariants and result equivalence must be checked.
Q: When does rollback become fundamentally harder?
A: After contraction deletes the old representation, because rollback may require restoring data rather than switching code or reads.
```
