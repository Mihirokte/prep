---
id: sec-data-lifecycle
chapter: sec-data
title: Data lifecycle and deletion
minutes: 3
---
Protecting data includes deciding why it exists, where it flows, how long it remains, and how deletion is proven. Encryption does not solve over-collection or indefinite retention. A deletion request is a distributed workflow across every derived copy.

## Build the inventory

Classify data by sensitivity and purpose. Map primary databases, replicas, caches, search indexes, object stores, analytics, logs, exports, and backups. Record the stable identifier that links each copy to a user or tenant. If a system cannot locate the subject's records, it cannot reliably delete them.

```flow
dir: LR
request: Delete request | actor
orchestrator: Deletion job | step
primary: Primary data | store
search: Search index | store
objects: Object store | store
analytics: Analytics sink | store
audit: Safe audit record | store
request -> orchestrator
orchestrator -> primary
orchestrator -> search
orchestrator -> objects
orchestrator -> analytics
orchestrator -> audit : results only
```

Minimize collection at design time. Retention should be a policy with a duration, owner, and enforcement job, not a sentence in documentation.

## Make deletion idempotent

Create a durable job keyed by the subject and request. Mark access disabled early, then dispatch system-specific work. Each worker deletes or irreversibly anonymizes its records and reports completion. Retrying a completed worker must be harmless.

```steps
Resolve identity | Map the request to stable internal identifiers
Block access | Prevent new use while cleanup runs
Delete sources | Remove primary and directly owned records
Delete derivatives | Purge caches indexes files and analytics copies
Verify | Require every mandatory sink to acknowledge terminal state
Audit | Store request time scope result and errors without deleted payload
```

Use a dead-letter path and alert for stuck sinks. Completion is not the absence of an exception; it is positive evidence from every required system.

```check
Q: An online platform receives a verified account deletion request for a customer whose data exists in primary databases, search indexes, caches, and analytics sinks. What approach ensures complete and reliable fulfillment of this deletion request?
- Execute a single DELETE statement in the primary transactional database and log an informational message when no SQL error is returned.
- Directly edit the immutable backup archives to remove the user's historical records before the next scheduled backup runs.
* Run an idempotent deletion workflow that dispatches cleanup across primary databases, derivatives, and caches, requiring positive acknowledgement from every mandatory sink.
- Disable access to the user account in the primary database while leaving analytics and search replicas intact for compliance auditing.
Why: A deletion request is a distributed workflow across every derived copy, requiring an idempotent job that purges primary records and derivative sinks and verifies positive completion from each. Relying on a single primary database delete or assuming deletion from immutable backups without a replay ledger fails to clean up distributed copies or handle failures.
```

## Handle backups honestly

Immutable backups may not support selective deletion. Limit retention and access, and maintain a deletion ledger that is replayed immediately after any restore before the system returns to service. This does not make the backup magically edited; it defines how deleted data is prevented from reappearing in normal operation.

Logs and audit records need minimization too. Store identifiers, timestamps, operation type, and result where required, not the sensitive payload being removed.

## Design for proof

Expose job status, age, failed sinks, and retry count. Sample completed deletions with read-after-delete checks and reconciliation queries. The design is complete when it states the terminal condition, backup behavior, retry semantics, and evidence retained.

```recall
Q: Why is deletion a distributed workflow?
A: User data is copied into replicas, caches, indexes, files, analytics, logs, and backups, so one database delete cannot reach every representation.
Q: What makes a deletion worker idempotent?
A: Repeating the same subject and request safely reaches the same deleted state without recreating data or duplicating side effects.
Q: How should immutable backups handle prior deletions after restore?
A: Retain them for a bounded period and replay a deletion ledger before restored data returns to normal service.
Q: What proves deletion completed?
A: Positive terminal acknowledgements and verification from every required sink, with stuck or failed work visible and retried.
```
