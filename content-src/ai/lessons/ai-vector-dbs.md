---
id: ai-vector-dbs
chapter: ai-stack
title: Choosing a vector database
minutes: 8
---
A vector database stores embeddings and answers nearest-neighbour queries fast. The interview rarely wants a product ranking, it wants the trade-off that decides between a Postgres extension, a dedicated engine, and a managed service, plus enough grasp of the index internals to reason about recall and memory. Every specific throughput, recall, or price number in this space comes from vendor or comparison-blog content, so state the shape of the trade-off confidently and re-verify any number against your own workload.

## The landscape, by category not ranking

| Option | What it is | Pitch |
|---|---|---|
| pgvector | A Postgres extension, not a standalone DB | Reuse the database you already run |
| Pinecone | Managed, hosted service | No ops, historical mindshare leader |
| Weaviate | Open-source engine | Schema flexibility, native hybrid search |
| Qdrant | Open-source, Rust | Performance focus |
| Chroma | Open-source, lightweight | Developer experience, common in prototyping |
| Milvus | Open-source, distributed | Very large scale |

## The claim that survives scrutiny

One statement recurs independently and matches sound engineering: pgvector is displacing standalone vector databases at small-to-mid scale, roughly under ten million vectors. If you already run Postgres, adding a vector column avoids standing up and operating new infrastructure, and pgvector has closed much of the performance gap at moderate scale. pgvector supports both HNSW and IVFFlat indexes, cosine, L2, and inner-product distance, and vectors up to two thousand dimensions in an index (pgvector docs, re-verify current limits).

So for a two-million-document RAG system already on Postgres, the defensible answer is add pgvector, two million is comfortably inside the cited sweet spot, while naming the roughly ten-million threshold as a heuristic to revisit with your own benchmark, not gospel.

```flow
dir: TB
need: Need vector search | actor
pg: Already run Postgres and under ~10M? | gate
addpg: Add pgvector | store
scale: Tens of millions or heavy ops? | gate
ded: Dedicated or managed engine | store
need -> pg
pg -> addpg : yes
pg -> scale : no
scale -> ded : yes
scale -> addpg : no
```

## Index internals you can reason about

The index is how the DB avoids comparing the query to every stored vector. Three ideas cover the field.

```steps
HNSW | A navigable graph of vectors. Fast and high-recall, but holds the graph in memory, so RAM cost rises with scale.
IVF | Cluster vectors into lists, search only the nearest few lists. Less memory than HNSW, recall tuned by lists probed.
PQ | Product quantization compresses each vector into a short code. Big memory savings, some recall loss from the lossy codes.
```

These compose, IVF plus PQ is common at large scale (fit more vectors in RAM via compression, prune the search space via clustering), while HNSW is the common default when memory allows because its recall is strong out of the box.

> **Numbers.** All QPS, recall-percent, pricing, and market-size figures in this space come from vendor or SEO content (illustrative at best). State the trade-off shape, HNSW trades RAM for recall, PQ trades recall for RAM, managed trades money for ops, and benchmark the specifics yourself.

## Filtered search, the operational gotcha

Real queries are rarely pure similarity, they are find similar chunks where tenant equals X and date after Y. Combining a metadata filter with ANN search is harder than it sounds: filter first and the ANN index may be bypassed, filter after and you may retrieve k results then discard most, leaving too few. How well a DB handles filtered ANN (pre-filtering, post-filtering, or integrated) is a real differentiator that a feature-list comparison hides, so it is worth testing on your actual filter patterns.

```recall
Q: Why is pgvector the defensible choice for a 2M-document RAG system on Postgres?
A: Two million is inside the under-ten-million sweet spot where pgvector competes, and reusing the existing Postgres avoids standing up and operating a separate vector service. Name the ten-million threshold as a heuristic to re-benchmark, not a hard line.
Q: What does HNSW trade for its strong recall, and why does that matter at scale?
A: Memory. It holds a navigable graph of vectors in RAM, so RAM cost grows with the corpus. At tens of millions of vectors that memory bill can force a switch to IVF or PQ compression.
Q: What problem does product quantization solve, and at what cost?
A: It compresses each vector into a short code, cutting memory sharply so far more vectors fit in RAM. The cost is some recall loss, because the codes are lossy approximations of the original vectors.
Q: Why is filtered search a real differentiator rather than a checkbox feature?
A: Combining a metadata filter with ANN is genuinely hard, filter-then-search can bypass the index and search-then-filter can leave too few results. How a DB integrates the two decides real-world quality, which a feature list hides.
Q: Why should you distrust the specific benchmark numbers in vector-DB comparisons?
A: Nearly all QPS, recall, and pricing figures come from vendor or SEO content and depend on hardware, dataset, and tuning. The trade-off shape is reliable, the exact numbers are not, so benchmark your own workload.
```

===DEEPER===

### HNSW in a little more depth

HNSW (Hierarchical Navigable Small World) builds a multi-layer graph where each vector links to a few near neighbours, with sparse long-range links in upper layers and dense local links below. A search enters at the top, greedily hops toward the query through the sparse upper layers to get close fast, then refines in the dense lower layers. Two parameters dominate: the number of neighbours per node (higher means better recall and more memory) and the search breadth (higher means better recall and slower queries). The reason it is memory-hungry is that the whole graph must be resident to traverse, so its RAM footprint scales with both vector count and the neighbour count you chose, which is the constraint that eventually pushes very large corpora toward IVF or quantization.

### IVF and the lists-probed knob

IVF (inverted file) first clusters all vectors into a set of lists using k-means, storing each vector under its nearest centroid. A query is compared to the centroids, then searched only within the few nearest lists. The tuning knob is how many lists you probe: probe one and search is fast but may miss neighbours that fell into an adjacent cluster, probe many and recall rises toward exhaustive search but you lose the speed-up. This is a direct recall-versus-latency dial, and it is why IVF indexes need their probe count tuned against an eval set rather than left at a default. pgvector exposes exactly this as its IVFFlat probes setting.

### Product quantization, concretely

PQ splits each vector into several sub-vectors and replaces each sub-vector with the id of its nearest centroid from a small per-segment codebook, so a vector that was, say, 1536 floats becomes a handful of small integer codes. Distances are then approximated from the codes, which is dramatically cheaper in memory and often in compute. The cost is approximation error: two vectors with the same codes are indistinguishable, so recall drops, and the drop grows as you compress harder. In practice PQ is combined with a reranking pass, use the compressed index to shortlist candidates cheaply, then re-score the shortlist with the full-precision vectors, recovering most of the lost recall while keeping the memory win.

### When dedicated or managed still wins

Three situations justify leaving Postgres. Very large scale, tens of millions of vectors and up, where purpose-built distributed engines (Milvus, Qdrant clusters) handle sharding and memory that pgvector would strain against. No team to own ops, where a fully managed service (Pinecone's pitch) trades money for never patching, scaling, or tuning the store yourself. And native advanced features, where an engine's built-in hybrid search or schema handling (Weaviate's pitch) saves building it on top of Postgres. The decision is the same shape as the framework decision, reuse what you run until a concrete need, scale, ops burden, or a feature, justifies the new dependency.
