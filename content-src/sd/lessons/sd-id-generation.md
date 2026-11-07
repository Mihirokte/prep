---
id: sd-id-generation
chapter: sd-building-blocks
title: Unique ID generation
minutes: 3
---
You need unique ids constantly (tweets, orders, messages) and "just use auto-increment" breaks once you shard — two shards both hand out id 1001.

Options:

- **UUID** — 128-bit, generated anywhere with no coordination. Downside: random, so it hurts database index locality and is bulky.
- **Snowflake (Twitter)** — the standard interview answer. A 64-bit int packed as `timestamp | machine-id | per-ms sequence`. No coordination needed, roughly **time-sortable** (newer ids are larger — great for feeds), compact. Each machine only needs a unique machine id.

```stack
title: Snowflake 64-bit layout (bits)
unit: bits
Sign | 1 | unused, keeps it positive
Timestamp | 41 | ms since a chosen epoch
Machine id | 10 | which node generated it
Sequence | 12 | per-ms counter on that node
```

- **Ticket server / DB range allocation** — a central service hands out blocks of ids to each node; nodes burn through their block locally. Simple, but the allocator is a dependency.

The winning move is usually Snowflake, and the reason to say is "time-sortable + no coordination," which is what makes it fit feeds and logs. The bit split above is Twitter's original layout (per the Snowflake ID spec: 41-bit timestamp, 10-bit machine id, 12-bit sequence).

```check
Q: You are building a high-volume social feed that stores posts across dozens of database shards. You need 64-bit compact IDs that allow posts to be retrieved roughly sorted by creation time without coordinating across shards on every write. What ID generation strategy should you choose?
* Twitter Snowflake IDs generated locally on each shard node
- Auto-incrementing integer IDs allocated locally by each MySQL shard independently
- Random 128-bit UUIDs generated on the application servers
- A single central ticket server database allocating every sequential integer on demand
Why: Snowflake generates 64-bit, time-sortable IDs using local machine IDs and timestamps without requiring inter-node coordination, making it ideal for distributed sharded feeds. Plain auto-increment fails because separate shards generate duplicate IDs without cross-shard coordination. Random UUIDs are bulky (128 bits) and random, which hurts index locality and does not provide time sortability.
```

```recall
Q: Why does plain auto-increment break once you shard?
A: Each shard allocates ids independently, so two shards both hand out the same value, for example 1001. There is no coordination across shards, so uniqueness is lost.
Q: Why is Snowflake usually preferred over a random UUID?
A: Snowflake ids are roughly time-sortable because the timestamp is in the high bits, so newer ids are larger, which fits feeds and logs. Random UUIDs hurt index locality and are bulkier at 128 bits.
Q: What is the cost of a ticket-server approach?
A: The central allocator becomes a dependency and a potential bottleneck or single point of failure. Nodes burn through a block locally to reduce calls, but you still rely on that service being up.
Q: Why does Snowflake need no coordination between machines at generation time?
A: Each machine has a unique machine id baked into the id, and uses its own clock plus a per-millisecond sequence counter. Uniqueness comes from timestamp plus machine id plus sequence, not a shared allocator.
```
