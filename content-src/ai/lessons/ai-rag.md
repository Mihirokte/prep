---
id: ai-rag
chapter: ai-patterns
title: RAG grounding a model in your data
minutes: 9
---
Retrieval-Augmented Generation is the default way to ground a model in private or fast-changing data it was never trained on. The shape: embed your corpus once offline, then at query time retrieve the most relevant chunks and feed them to the model alongside the question. Interviewers care because RAG is where most production LLM work actually happens, and because the common failure, blaming the model when retrieval was the problem, reveals whether you understand the pipeline or just the vocabulary.

## The two paths: offline and online

RAG is two pipelines sharing one embedding model. The offline (indexing) path runs once per document: chunk, embed, store. The online (query) path runs per request: embed the query, retrieve, optionally rerank, then generate. The embedding model must be identical on both sides, a query embedded by one model cannot be compared to chunks embedded by another.

```flow
dir: LR
docs: Documents | store
chunk: Chunk and embed | model
idx: Vector index | store
q: User query | actor
emb: Embed query | model
rr: Rerank | model
llm: LLM | model
docs -> chunk : offline
chunk -> idx : vectors
q -> emb : online
emb -> idx : search
idx -> rr : top-k
rr -> llm : top-n
q -> llm : question
llm -> q : grounded answer
```

## A worked example with numbers

Take a two-million-document support knowledge base. Chunk each article at about four hundred tokens with sixty tokens of overlap, giving roughly two and a half million chunks, and embed them. On a query: retrieve the top thirty candidates by cosine similarity (cheap, over the whole index), rerank those thirty with a cross-encoder down to the top five, and prompt the model with those five chunks plus the question. The cheap bi-encoder search casts a wide net, the expensive reranker runs only on thirty candidates, and only five chunks reach the context, keeping both cost and token budget bounded.

## The failure taxonomy: retrieval vs generation

Split every RAG failure into two buckets, because they have different fixes.

| Failure | Symptom | Fix |
|---|---|---|
| Retrieval | The answer chunk never entered the context | Chunking, hybrid search, reranking, more k |
| Generation | The right chunk was present but the answer is wrong | Prompt, citation requirement, model choice |

The order matters. If the answer text is not in the retrieved context, no prompt change can produce a correct answer, so you measure retrieval first (recall at k) and only tune generation once retrieval is good. Most teams get this backwards and tune the prompt for weeks against a retrieval defect.

> **Pitfall.** Debugging RAG from the generation prompt. If recall at k is low the model never saw the answer, and every prompt tweak is wasted motion. Measure the retriever first.

## Citations and faithfulness

A grounded answer should cite which retrieved chunk each claim came from, by attaching an id to each chunk in the prompt and asking the model to reference it. Citations do two jobs: they let a user verify the answer, and they let you measure faithfulness, whether every claim in the answer is actually supported by a retrieved chunk rather than invented. An answer that is fluent, confident, and unsupported by any retrieved chunk is the classic RAG hallucination, and citations are how you catch it.

## Contextual retrieval: a measured improvement

Anthropic's Contextual Retrieval (2024) prepends a short, model-written line to each chunk before embedding, situating it in its source document so a chunk like revenue grew three percent keeps the company and quarter it would otherwise lose. Their measured reductions in top-twenty retrieval failures: thirty-five percent from contextual embeddings alone, forty-nine percent with contextual BM25 added, and sixty-seven percent with reranking on top (Anthropic, Introducing Contextual Retrieval, 2024). It is the clearest documented single win in the retrieval stack.

```recall
Q: Why must the same embedding model run on both the offline and online paths?
A: Retrieval compares the query vector to chunk vectors by distance. Vectors from two different models live in different spaces and are not comparable, so a query embedded by one model cannot be matched against chunks embedded by another.
Q: A RAG answer is wrong. What do you measure before touching the prompt, and why?
A: Recall at k, whether the answer chunk is even in the retrieved context. If it is not, no prompt change can fix the answer, so retrieval is the first suspect, not generation.
Q: What is the point of requiring citations in a RAG answer beyond user trust?
A: They let you measure faithfulness, every claim should map to a retrieved chunk. An uncited or unsupported claim flags a hallucination the retrieval context did not justify.
Q: Why retrieve thirty candidates but prompt the model with only five?
A: The cheap bi-encoder search casts a wide net for recall, the expensive reranker sharpens precision on that small set, and a small final context keeps token cost and lost-in-the-middle dilution down.
Q: What does contextual retrieval change about a chunk, and when in the pipeline?
A: It prepends a model-written line naming the chunk source and context before embedding, so the vector carries context the raw chunk lacked. It must happen at index time because the vector is computed then.
```

===DEEPER===

### Why the retriever is the product

The phrase to carry into an interview is the retriever is the product. A frontier model given the right five chunks will answer well with a plain prompt, and the best prompt in the world cannot answer from chunks that do not contain the answer. This inverts where beginners spend effort. The leverage is in chunking, embedding quality, hybrid search, and reranking, the generation step is comparatively robust once its inputs are right. It also reframes evaluation: you evaluate the two halves separately, retrieval with recall at k and mean reciprocal rank, generation with faithfulness and answer relevance, because a single end-to-end score hides which half failed.

### The knobs that beat the vector-DB choice

Teams agonise over which vector database to buy, but the quality-determining knobs sit elsewhere. Chunk size and overlap set what a vector even represents. Embedding model and dimensionality set how well similar meanings land near each other, production models commonly sit around 768 to 1536 dimensions, and Matryoshka-style embeddings let you truncate to 256 to 512 for memory and latency savings at modest recall cost (re-verify current models, 2026, fast-moving). The retrieve-then-rerank split sets precision: retrieve k around twenty to fifty cheaply, rerank to the five to eight you actually use. A cross-encoder reranker scores each query-chunk pair jointly, roughly tens of milliseconds per candidate, far more accurate than the bi-encoder that produced the list but too slow to run over the whole corpus, which is why it runs only on the candidate set.

### Measuring recall at k

Build a small evaluation set of questions paired with the chunk (or document) that contains the answer. For a retrieval configuration, recall at k is the fraction of questions whose answer chunk appears in the top k retrieved. Sweep chunk size, embedding model, k, and whether you add hybrid search or reranking, and keep what maximises recall at your target k. This number, not a vendor benchmark, is what tells you the retriever is good enough to bother tuning generation. The common follow-up, how do you pick chunk size, has one honest answer: empirically, on your own eval set, there is no confirmed universal best, start near three hundred to five hundred tokens with overlap and measure.

### Where RAG sits against alternatives

RAG is not the only grounding strategy, long context windows let you stuff a bounded corpus directly, and fine-tuning bakes knowledge into weights. RAG wins when data is large, frequently updated, or needs per-document access control and citations, because it keeps knowledge external, swappable, and auditable. That trade-off against long context is a live, actively researched debate covered in its own lesson, the point here is that RAG remains the default precisely because external, updatable, citable knowledge is what most real systems need.
