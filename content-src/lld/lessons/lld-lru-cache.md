---
id: lld-lru-cache
chapter: lld-concurrency-api
title: LRU cache: the design IS the data structure
minutes: 4
---
LRU Cache is one of the highest-frequency FAANG problems, and it's pure data-structure composition — the whole problem is getting O(1) on both operations.

**Requirements:** fixed capacity; `get(key)` and `put(key, value)` both O(1); on overflow evict the least-recently-used entry; any `get`/`put` marks a key most-recently-used.

**The composition:** a hash map for O(1) lookup, plus a **doubly linked list** ordered by recency (head = most recent, tail = least recent). Know *why* the alternatives fail before being asked — a singly linked list can't unlink a node in O(1); an array can't reorder in O(1).

```flow
dir: LR
map: Hash map key->node | store
head: Head (most recent) | step
mid: ... nodes ... | step
tail: Tail (evict next) | step
map -> head : O(1) lookup
head -> mid : next
mid -> tail : next
tail -> map : evict removes key
```

- `get(key)`: look the node up via the map, unlink it, move it to the head.
- `put` at capacity: evict the tail node, remove it from the map, insert the new node at the head and into the map.

**Concurrency follow-up:** a single lock around *both* structures — they must be updated together, so this is a genuine multi-field update, not a job for atomics alone.

**LFU variant** (harder follow-up): evict least-*frequently*-used, which needs a frequency count per key plus a map of frequency → doubly-linked list of keys at that frequency, so ties break by recency within a bucket.

```recall
Q: Why does an LRU cache need both a hash map and a doubly linked list?
A: The map gives O(1) lookup by key; the doubly linked list keeps entries ordered by recency and supports O(1) unlink and move-to-head. Neither alone is O(1) on both get and put, so the two compose.
Q: Why a doubly linked list rather than a singly linked list or an array?
A: A doubly linked node can be unlinked in O(1) because it knows its predecessor; a singly linked list cannot, and an array cannot reorder in O(1). Both alternatives break the O(1) requirement.
Q: Why is making an LRU cache thread-safe a lock, not an atomic?
A: A get or put updates both the map and the list, and they must change together, so the invariant spans two structures. Atomics only cover a single variable, so you need one lock around both updates.
Q: How does the LFU variant differ from LRU in what it tracks?
A: LFU evicts the least-frequently-used key, so it keeps a frequency count per key plus a map from frequency to a doubly linked list of keys at that frequency, breaking ties by recency within a bucket. LRU only tracks recency order.
```
