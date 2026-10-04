---
id: ai-hybrid-search
chapter: ai-patterns
title: Hybrid search and reranking
minutes: 9
---
Dense vector retrieval is good at paraphrase and meaning but bad at exact identifiers, product codes, error strings, and rare technical terms. Keyword search (BM25) is the mirror image, it nails exact tokens and fails on synonyms. Running both and fusing the results beats either alone, and that is the whole case for hybrid search. Interviewers like this topic because it exposes whether you understand why each retriever fails, not just that you wired two libraries together.

## Why each retriever fails

A dense retriever embeds query and document into a shared vector space and ranks by closeness. It understands that car and automobile are near, but a part number like A1B2-9900 is a near-random point in that space, nothing meaningful was learned about it, so dense search misses exact-match queries. BM25 scores documents by term overlap weighted by how rare each term is, so it ranks the document containing A1B2-9900 first, but it has no idea that car and automobile are the same thing, so it misses paraphrase. Their failure modes are complementary, which is exactly why fusing them helps.

```flow
dir: LR
q: Query | actor
bm: BM25 keyword | store
dn: Dense vector | store
rrf: RRF fusion | step
rr: Cross-encoder rerank | model
llm: LLM | model
q -> bm : exact terms
q -> dn : meaning
bm -> rrf : ranked list A
dn -> rrf : ranked list B
rrf -> rr : fused top-N
rr -> llm : top-n re-scored
```

## Reciprocal Rank Fusion, with a worked example

RRF merges two ranked lists using only positions, not raw scores, which sidesteps the fact that BM25 scores and cosine distances live on incompatible scales. For each document, sum one over sixty plus its rank in each list it appears in, then sort by that sum. The constant sixty comes from the original paper (Cormack, Clarke, Buttcher, Reciprocal Rank Fusion outperforms Condorcet, SIGIR 2009) and the authors note it was fixed in a pilot and worked without being especially sensitive.

Worked numbers. Document D is rank one in the dense list and rank three in the BM25 list. Document E is rank two in both. With k equal to sixty:

| Doc | Dense rank | BM25 rank | RRF score |
|---|---|---|---|
| D | 1 | 3 | 1/61 + 1/63 = 0.01640 + 0.01587 = 0.03227 |
| E | 2 | 2 | 1/62 + 1/62 = 0.01613 + 0.01613 = 0.03226 |

D edges out E: strong in one list plus decent in the other narrowly beats merely-good in both. A document that appears in only one list still scores, it just gets one term instead of two, so it ranks below documents both retrievers agreed on. That agreement-rewarding behaviour is the point.

## Reranking: the precision step

After fusion you have a ranked candidate list, but it was produced by cheap methods. A cross-encoder reranker re-scores each query-candidate pair by reading them together in one model pass, which catches relevance the separate bi-encoder embeddings missed. It is accurate but slow, tens of milliseconds per pair, so you run it only on the small fused candidate set (say top twenty to fifty), never the whole corpus.

```bars
title: Where latency goes in a hybrid pipeline (illustrative)
unit: ms
BM25 search | 10
Dense ANN search | 15
RRF fusion | 1
Cross-encoder rerank top-30 | 300
```

The reranker dominates the latency budget, which is the central trade-off: it buys precision at real cost, so you tune the candidate count to balance accuracy against the deadline.

> **Rule of thumb.** Chip Huyen's advice, worth repeating: try keyword retrieval (BM25) before reaching for vector search. The cheap baseline is often strong, and a vector DB adds cost and can obscure exact-keyword matches. Add dense retrieval where it demonstrably helps, not by default.

```recall
Q: Why does fusing BM25 and dense retrieval beat either one alone?
A: Their failure modes are complementary. Dense misses exact identifiers and rare terms, BM25 misses synonyms and paraphrase. Fusing covers both query types with one pipeline.
Q: Why does RRF use ranks instead of the retrievers raw scores?
A: BM25 scores and cosine distances are on incompatible scales, so adding them directly is meaningless. Ranks are comparable across both lists, so fusing on position needs no score calibration.
Q: In the worked example D (ranks 1 and 3) beat E (ranks 2 and 2). What does that reveal about RRF?
A: It rewards strong agreement, being top in one list plus decent in the other narrowly beats being merely good in both. High placement in any list contributes a large term.
Q: Why run the cross-encoder on only the top candidates, not the whole corpus?
A: It reads each query-candidate pair jointly, tens of milliseconds each, far too slow for millions of documents. It only re-scores the small set the cheap retrievers already shortlisted.
Q: Chip Huyen suggests trying BM25 before vector search. Why is that the cheaper-first order?
A: BM25 needs no embedding model, no vector index, and no ANN tuning, yet is often strong on its own. You add dense retrieval only where it measurably helps, avoiding needless cost and complexity.
```

===DEEPER===

### BM25 in one paragraph

BM25 scores a document for a query by summing, over the query terms it contains, a weight that rises with how often the term appears in the document (with diminishing returns, so a term repeated twenty times is not twenty times as strong) and with how rare the term is across the whole corpus (inverse document frequency, so common words like the contribute almost nothing). It also normalises for document length so a long document does not win just by containing more words. The result is a strong lexical baseline that has been the default in search engines for decades, and it is exactly the signal dense embeddings throw away when they compress text into a smooth semantic space.

### Implementing the fusion from scratch

The algorithm is deliberately small. Take two ranked lists of document ids. Build a dictionary mapping each document id to its accumulated score. For each list, walk it in rank order and add one over sixty plus rank to that document's entry, creating the entry at zero if it is new. After both lists are processed, sort the dictionary by value descending and return the top results. There is no training, no score normalisation, and no tuning beyond the single constant, which is why RRF became the default hybrid merge in OpenSearch, Elasticsearch, Azure AI Search, and others. A from-scratch implementation is a common interview drill precisely because it is short enough to write live and still forces you to explain why rank-based fusion avoids the score-scale problem.

```python
# Sketch: RRF over any number of ranked id lists
def rrf(lists, k=60):
    scores = {}
    for ranked in lists:                 # each is a list of doc ids, best first
        for rank, doc_id in enumerate(ranked, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)
```

### Weighted fusion and its tension with RRF

Plain RRF treats both retrievers as equally trustworthy. When one is clearly stronger on your workload you can weight its term, multiply the dense contribution by a factor above one, say, so its rankings count for more. The catch is that a weight is one more parameter to tune against an eval set, and tuning it wrong can make hybrid worse than the better single retriever. The honest default is unweighted RRF, which needs no tuning and is hard to beat, and you reach for weights only when a measured gap justifies the extra parameter. This is the same measure-before-tuning discipline that governs chunk size and k.

### Latency budgeting

The reranker is the expensive stage, so the candidate count feeding it is the main latency lever. Reranking thirty candidates at ten milliseconds each is three hundred milliseconds, reranking a hundred is a second, often past an interactive budget. If you must rerank more, run the two retrievals in parallel (they are independent) so their latencies overlap rather than add, and consider a smaller or distilled reranker. The decision rule: pick the candidate count as the largest your deadline allows, because reranker precision generally improves with more candidates up to a point, then set the retrieval k to feed it.
