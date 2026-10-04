---
id: ai-hybrid-search
chapter: ai-patterns
title: Hybrid search and reranking
minutes: 4
---
Dense (vector) retrieval is good at paraphrase and semantic matches but *bad* at exact identifiers, product codes, and rare technical terms. Keyword search (BM25) is the reverse. Running both and fusing the results beats either alone.

The standard pipeline:

1. **Retrieve twice** — a BM25 keyword search and a dense vector search, each returning a ranked list.
2. **Fuse** the two lists with **Reciprocal Rank Fusion (RRF)**, the usual merge method.
3. **Rerank** the top-N fused candidates with a cross-encoder — a separate, more expensive model that re-scores each candidate against the query, run only on the small candidate set.

Chip Huyen's advice is worth repeating: **try keyword retrieval (BM25) before reaching for vector search.** Vector databases add cost and can obscure exact-keyword matches; get the cheap baseline right first, then add dense retrieval where it demonstrably helps.

A good drill answer explains *why* each retriever fails on certain query types — not just that you wired two libraries together.
