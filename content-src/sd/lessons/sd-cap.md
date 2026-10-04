---
id: sd-cap
chapter: sd-fundamentals
title: CAP and PACELC, in plain terms
minutes: 4
---
CAP: when the network **partitions** (nodes can't talk), you must choose **Consistency** or **Availability** — you cannot have both during the partition.

- **CP** — refuse or block requests that can't be made consistent. Pick this for money, inventory, anything where a wrong answer is worse than no answer.
- **AP** — keep serving, accept that different nodes may briefly disagree, reconcile later. Pick this for feeds, likes, presence — where stale is fine and downtime is not.

CAP only describes behaviour *during a partition*, which is rare. **PACELC** completes it: **E**lse (normal operation), you still trade **L**atency vs **C**onsistency. A globally consistent write needs a round trip to a quorum; a fast local write risks staleness. So the real everyday question isn't "CP or AP" — it's "how much staleness can this feature tolerate for how much latency?"

Say the trade-off in feature terms: "The balance must be consistent, so that path is CP even if it means rejecting a write during a partition. The activity feed is AP — I'd rather show a slightly stale feed than an error."

```flow
dir: TB
part: Network partition | gate
choose: Consistent or available? | gate
cp: CP: block or refuse | store
ap: AP: serve, reconcile later | store
part -> choose
choose -> cp : wrong answer is worse
choose -> ap : downtime is worse
```

```recall
Q: Does CAP force a consistency-vs-availability choice all the time?
A: No. CAP only applies during a network partition, which is rare. In normal operation PACELC takes over, where you still trade latency against consistency on every request.
Q: When would you choose CP over AP for a feature?
A: When a wrong or stale answer is worse than no answer, for example a bank balance or inventory. You block or refuse writes that cannot be made consistent rather than serve a disagreement.
Q: What breaks if you make a globally consistent write?
A: It must reach a quorum, so a cross-region write inherits cross-region round-trip latency instead of about a millisecond locally. That latency cost is the everyday PACELC trade-off.
Q: Is "eventually consistent" the same as "sometimes wrong"?
A: No. It converges to correct once writes propagate and conflicts resolve; with no new writes all replicas eventually agree. You pick it where a brief disagreement is acceptable.
```

===DEEPER===
**Mechanism.** "Consistency" in CAP is **linearizability** — every read sees the latest committed write, as if there were one copy. Systems achieve it with a **quorum**: with N replicas, if writes touch W nodes and reads touch R nodes and **W + R > N**, a read is guaranteed to overlap the latest write. A partition breaks this — some nodes are unreachable, so you either block until quorum returns (CP) or answer from whoever you can reach and reconcile later (AP).

**Numbers an interviewer expects.**
- Common quorum: **N=3, W=2, R=2** → tolerates one node down while staying consistent (2+2 > 3).
- **AP tunable low**: W=1, R=1 → fastest, but reads can be stale until anti-entropy/read-repair converges (typically **sub-second to seconds**).
- A linearizable cross-region write must reach a quorum, so it inherits **cross-region RTT (~80–150 ms)**; a local eventually-consistent write is **~1 ms**. That gap is the PACELC "else" trade-off made concrete.

**Worked example.** Cassandra (AP, tunable): a "like" count writes with W=1 and reads with R=1 for speed — a viewer might briefly see 1,240 vs 1,241 likes, which is harmless. A bank ledger on the same cluster would use `QUORUM`/`SERIAL` (Paxos-backed lightweight transactions) so a balance is never double-spent, paying the latency for correctness. Same store, different consistency level per feature.

**Common follow-ups**
- *Q: Isn't "eventually consistent" just "sometimes wrong"?* A: It converges to correct once writes propagate and conflicts resolve; the guarantee is that with no new writes, all replicas eventually agree. You choose it where a brief disagreement is acceptable.
- *Q: How are conflicting concurrent writes resolved?* A: Last-write-wins by timestamp (simple, can lose data), version vectors to detect concurrency, or CRDTs that merge deterministically (counters, sets).
- *Q: Where does PACELC bite in normal operation?* A: Every day, not just during partitions — a globally strong system pays latency on every write; that's the L-vs-C leg, and it's why most consumer features pick low latency + eventual consistency.
- *Q: Is a single-node SQL DB CA?* A: Effectively, because there's no partition to survive — CAP only forces a choice in a distributed system. Add replication and the async-vs-sync choice reintroduces the trade-off.
