---
id: sd-estimation
chapter: sd-interview
title: Estimation, only when it changes the design
minutes: 3
---
Back-of-the-envelope math is a tool, not a ritual. Hello Interview's advice: **skip it unless a number will change your design** — and say that out loud.

Compute inline only when the result forces a decision. Example: "Will trending topics fit in one in-memory heap, or do I need to shard it?" — that is worth 60 seconds of math. "How many bytes is a username?" is not.

Numbers worth memorising:

- 1 request/user/day at 100M users ≈ **~1,150 QPS** average, and peak is often 2–3x average.
- Reads usually dominate writes 10:1 to 1000:1 for consumer products — this decides whether you optimise for read or write path.
- 1 KB × 1M writes/day ≈ **1 GB/day** ≈ ~365 GB/year. This tells you if data fits on one node or must be partitioned.

If the math doesn't move a box on your diagram, don't do it.

```flow
dir: LR
q: Estimation prompt | actor
check: Will it change design? | gate
compute: Compute inline (60s) | step
skip: Skip, say so aloud | step
q -> check
check -> compute : yes, forces a decision
check -> skip : no, just a number
```

```recall
Q: When should you do back-of-the-envelope math in a design round?
A: Only when the result will change the design, and say that out loud. If a number does not move a box on the diagram, computing it wastes time you need elsewhere.
Q: Why does the read-to-write ratio matter early?
A: Consumer products often read ten to a thousand times more than they write, which decides whether you optimize the read path or the write path. That shapes caching, replicas, and indexing choices.
Q: What design decision does "1 KB x 1M writes/day is about 1 GB/day" help you make?
A: Whether the data fits on one node or must be partitioned. Projecting to roughly 365 GB/year tells you if a single machine's storage is enough or sharding is forced.
```
