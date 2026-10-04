---
id: sd-sql-vs-nosql
chapter: sd-fundamentals
title: SQL vs NoSQL
minutes: 5
---
The honest answer is rarely "NoSQL because scale." Choose on the shape of your data and access patterns.

**Reach for a relational DB (Postgres/MySQL) when** you have relationships and need joins, you want ACID transactions (money, inventory), or your query patterns will evolve and you can't predict them. Modern Postgres scales much further than interview folklore admits — read replicas and partitioning take you a long way.

**Reach for NoSQL when** the access pattern is known and simple (key → value, or a document fetched by id), you need horizontal write scaling beyond one node, or the schema is genuinely flexible. Families:

- **Key-value** (DynamoDB, Redis) — fastest, simplest; you design around the partition key.
- **Document** (MongoDB) — nested JSON fetched as a unit.
- **Wide-column** (Cassandra, ScyllaDB) — huge write throughput, query-first schema.

The interviewer's real question is **"why?"** "I'll use DynamoDB because the only access pattern is get-cart-by-user-id, writes are heavy, and I never join" is a strong answer. "NoSQL scales better" is not.

A useful tell: if you find yourself wanting joins and transactions on top of a NoSQL store, you probably picked wrong.

```flow
dir: TB
start: Pick a datastore | gate
joins: Need joins or ACID? | gate
sql: Relational DB | store
known: Access pattern simple? | gate
nosql: NoSQL | store
rethink: Reconsider choice | gate
start -> joins
joins -> sql : yes
joins -> known : no
known -> nosql : key or doc by id
known -> rethink : wants joins later
```

```recall
Q: Why is "NoSQL scales better" a weak interview answer?
A: It names a property, not a reason tied to this system. The strong answer ties the choice to the access pattern, for example get-cart-by-user-id with heavy writes and no joins, which is what actually makes NoSQL fit.
Q: What is a hot partition and what causes it?
A: One partition key gets disproportionate traffic and throttles while the rest of the table sits idle. A poorly chosen partition key that does not spread load evenly causes it.
Q: When should you reach for horizontal write scaling instead of one Postgres primary?
A: Only when a single primary's write throughput or storage is genuinely the wall, roughly over ten thousand sustained writes per second or multi-TB, with a simple access pattern. Otherwise replicas and partitioning go very far.
Q: You want joins and transactions on top of a NoSQL store. What does that signal?
A: That you probably picked the wrong store. Needing cross-item joins and ACID is the shape relational databases serve directly, so forcing it onto NoSQL means reinventing transactions in app code.
```

===DEEPER===
**Mechanism.** A relational DB stores rows in B-tree/heap pages and enforces ACID with a write-ahead log (WAL) plus MVCC — every transaction sees a consistent snapshot, and joins happen in the engine. NoSQL trades this: DynamoDB and Cassandra hash your **partition key** to a node and store items together, so a get-by-key is one hop with no coordinator. There are no cross-partition joins because there is no single node that sees all the data — you denormalize instead.

**Numbers an interviewer expects.**
- A well-tuned single Postgres node: **tens of thousands of simple TPS**, and comfortably holds **hundreds of GB to a few TB** before partitioning is forced.
- DynamoDB single-item read/write: **single-digit ms**, and it scales writes horizontally to **millions of ops/sec** because throughput is per-partition and it adds partitions.
- Rule of thumb: reach for horizontal write scaling only when one primary's write throughput or storage is genuinely the wall — usually **>~10k sustained writes/sec** or **multi-TB** with a simple access pattern.

**Worked example.** A shopping cart: only access pattern is get/put-cart-by-user-id, writes are frequent, no joins, no reporting. DynamoDB with `userId` as partition key gives O(1) single-digit-ms access and scales writes for free — a textbook NoSQL fit. Contrast an orders + payments + inventory system: you need a transaction that debits inventory and records payment atomically. That's Postgres; forcing it onto DynamoDB means reinventing transactions in app code.

**Common follow-ups**
- *Q: Can't Postgres scale to millions of users?* A: Yes — read replicas for read scaling, then table partitioning / Citus for write scaling get you very far. "NoSQL for scale" is usually premature; the real driver is access-pattern simplicity.
- *Q: How does DynamoDB do transactions then?* A: `TransactWriteItems` gives ACID across a bounded set of items, but it's limited and pricier; if you lean on it heavily, a relational DB was the right call.
- *Q: What's the cost of a bad partition key?* A: A **hot partition** — one key gets disproportionate traffic and throttles while the rest of the table is idle. You choose the key to spread load *and* co-locate what you read together.
- *Q: Schema flexibility — real advantage?* A: For genuinely heterogeneous documents, yes. But Postgres `jsonb` covers most "flexible" needs while keeping joins and indexes, so flexibility alone rarely justifies NoSQL.
