---
id: ai-vector-dbs
chapter: ai-stack
title: Vector databases
minutes: 4
---
The landscape: **Pinecone** (managed, historical mindshare leader), **Weaviate** (schema flexibility, native hybrid search), **Qdrant** (Rust, performance-focused, open-source), **Chroma** (developer experience, common in prototyping), **Milvus** (large scale), and **pgvector** (a Postgres extension, not a standalone DB).

The one claim that survives scrutiny because it recurs independently *and* matches sound engineering: **pgvector is displacing standalone vector DBs at small-to-mid scale (roughly under 10M vectors).** If you already run Postgres, adding a vector column avoids standing up new infrastructure, and pgvector has closed much of the performance gap at moderate scale.

So for a 2M-document RAG system already on Postgres, the defensible answer is **add pgvector** — 2M is comfortably inside the cited sweet spot — while naming the ~10M threshold as a heuristic to revisit with your own benchmark, not gospel.

**Where dedicated vector DBs still win:** very large scale (tens of millions+), fully managed ops with no team ownership (Pinecone's pitch), or native hybrid-search/schema features (Weaviate's pitch).

Every specific number in this space — QPS, recall %, pricing, market-size projections — comes from vendor or comparison-blog content. State the *shape* of the trade-off (managed vs. self-hosted vs. Postgres-native) confidently; don't quote a specific benchmark number without re-verifying it against your own workload.
