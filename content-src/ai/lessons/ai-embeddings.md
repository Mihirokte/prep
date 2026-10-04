---
id: ai-embeddings
chapter: ai-foundations
title: Embeddings and similarity
minutes: 8
---
An embedding is a text turned into a vector of numbers so that meaning becomes geometry: similar texts land near each other. Retrieval, clustering, deduplication, and classification all rest on this. Interviewers probe embeddings because the common mistakes, mixing distance metrics, forgetting to re-embed when the model changes, ignoring domain mismatch, cause silent quality loss that is hard to debug later.

## What an embedding is

A model maps text to a fixed-length vector, say 768 or 1536 numbers. Training pulls vectors of related texts together and pushes unrelated ones apart. The individual numbers are not interpretable; only distances and angles between vectors mean anything. Two paraphrases should sit close; a question and its answer should sit close if the model was trained for retrieval.

```flow
dir: LR
q: Query text | actor
m: Embedding model | model
v: Query vector | step
idx: Vector index | store
res: Nearest neighbours | step
q -> m : text
m -> v : vector
v -> idx : search
idx -> res : top-k by similarity
```

## Cosine, dot product, and L2

Three ways to measure closeness, and they are not interchangeable.

| Metric | Measures | Sensitive to length | Use when |
|---|---|---|---|
| Cosine similarity | Angle between vectors | No (normalises) | Default for text retrieval |
| Dot product | Angle and magnitude | Yes | Model trained for it, or vectors pre-normalised |
| L2 (Euclidean) | Straight-line distance | Yes | Some clustering, when magnitude is meaningful |

The key fact: if vectors are normalised to unit length, cosine similarity, dot product, and L2 rank neighbours identically. If they are not normalised, dot product and L2 are swayed by magnitude, which may or may not carry meaning. Match the metric your model was trained with, embedding model cards state it, and keep it consistent between indexing and querying.

> **Pitfall.** Indexing with one metric and querying with another, or normalising on one side only. Rankings go subtly wrong and recall drops with no error thrown. Pick one metric, normalise consistently.

## Dimensions and Matryoshka truncation

Bigger vectors can hold more information but cost more to store and search. Matryoshka Representation Learning (Kusupati et al.) trains a model so the most important information is packed into the early dimensions. That lets you truncate a long vector to a shorter prefix and keep most of the quality. OpenAI's text-embedding-3 models are trained this way and expose a `dimensions` parameter to request a shorter vector (OpenAI embeddings docs, as of 2026, re-check). Reported results show large truncations keeping most retrieval quality, for example text-embedding-3-large truncated to 256 dimensions beating the older ada-002 at 1536 on a public benchmark (OpenAI, MTEB; illustrative of the trade-off).

```bars
title: Storage versus retrieval quality by dimension (illustrative)
unit: relative
Full 3072-dim quality | 100
256-dim quality | 92
Full 3072-dim storage | 12
256-dim storage | 1
```

Truncate only a model trained for it. Chopping a non-Matryoshka vector destroys it.

## Bi-encoder versus cross-encoder

- Bi-encoder: embed the query and each document separately, compare vectors. Documents are embedded once, offline, so search is fast, you only embed the query at query time. This is what powers vector search.
- Cross-encoder: feed query and document together into the model and output one relevance score. Far more accurate because the two texts attend to each other, but you cannot precompute, every query-document pair is a fresh forward pass, so it is too slow to score a whole corpus.

The standard pattern uses both: a bi-encoder retrieves a few hundred candidates cheaply, then a cross-encoder reranks the top candidates for accuracy. The reranking lesson covers this.

## Re-embed everything when the model changes

Embeddings from different models (or even different versions, or different dimension settings) live in different vector spaces and are not comparable. If you switch embedding models, you must re-embed the entire corpus; querying a new-model vector against an old-model index returns garbage with no error. Budget re-embedding as a real migration cost, it is often why teams hesitate to upgrade.

> **Interview.** Asked how to upgrade an embedding model in production: re-embed the whole corpus into a new index, dual-write or shadow-read to compare recall, then cut over. You cannot mix spaces.

## Domain mismatch and ANN

A model trained on general web text underperforms on specialised domains (legal, medical, code) because the notion of similarity it learned does not match the domain. Options: pick a domain-appropriate model, fine-tune one, or add a reranker. Measure recall@k on your own data before trusting any model.

At scale you do not compare the query to every vector (exact search is linear in corpus size). Approximate nearest neighbour (ANN) indexes trade a little recall for large speedups. HNSW builds a navigable small-world graph and walks it greedily, fast and high-recall, higher memory. IVF partitions vectors into clusters and searches only the nearest few, lower memory, tune the number of probes for the recall-speed trade. The vector-databases lesson goes deeper.

```recall
Q: When do cosine, dot product, and L2 rank neighbours identically, and when do they diverge?
A: Identically when vectors are unit-normalised. They diverge when vectors are not normalised, because dot product and L2 are then influenced by magnitude.
Q: Why can you truncate an OpenAI text-embedding-3 vector but not an arbitrary model's vector?
A: It was trained with Matryoshka Representation Learning, which front-loads important information into early dimensions. A non-Matryoshka vector spreads information across all dimensions, so truncation destroys it.
Q: Why is a cross-encoder more accurate but unusable for first-stage retrieval over a large corpus?
A: It feeds query and document together so they attend to each other (more accurate), but that means a fresh forward pass per pair, too slow to score a whole corpus. Use it to rerank a short candidate list.
Q: You swap in a better embedding model. What must you do and why?
A: Re-embed the entire corpus. Different models produce incomparable vector spaces, so querying across spaces returns meaningless neighbours with no error raised.
```

===DEEPER===

### Cosine from dot product, and why normalising unifies the metrics

Cosine similarity is the dot product divided by the product of magnitudes:

```text
cos(a, b) = (a . b) / (||a|| * ||b||)
```

If every vector is normalised so ||a|| = 1, then cos(a, b) = a . b, the dot product is the cosine. And squared L2 distance expands to ||a||^2 + ||b||^2 - 2(a . b) = 2 - 2(a . b) for unit vectors, a monotone decreasing function of the dot product. So on unit vectors, maximising cosine, maximising dot product, and minimising L2 all produce the same ranking. This is why many vector stores normalise on insert and then use dot product internally.

### HNSW and IVF, a little deeper

HNSW (Hierarchical Navigable Small World) layers graphs: upper layers are sparse for long hops, lower layers dense for local refinement. Search starts high, descends, and greedily walks toward the query. Key parameters: M (edges per node, higher means better recall and more memory) and efSearch (candidate list size at query time, higher means better recall and slower). IVF (inverted file) runs k-means to form cells, assigns each vector to its cell, and at query time probes the nProbe nearest cells. Product quantization (PQ) can compress vectors inside either scheme to cut memory at some recall cost. The universal rule: measure recall@k against an exact-search ground truth on your own data, and tune the knobs to your latency budget.

### Choosing and validating an embedding model

Public leaderboards like MTEB are a starting point, not an answer, they average over tasks that may not match yours. Build a small labelled set from your own domain (query, relevant-document pairs), compute recall@k and MRR for each candidate model and dimension setting, and include the cost of embedding and storage. A smaller or truncated vector that meets your recall bar is usually the better production choice than the top-of-leaderboard model, because it is cheaper to store and faster to search at scale.
