---
id: ai-rag-eval
chapter: ai-production
title: Evaluating a RAG system
minutes: 9
---
A RAG system fails in two completely different ways: retrieval can miss the document, or generation can mangle a document it was given. These need opposite fixes, so a single end-to-end score is almost useless for debugging. The core skill, and the thing interviewers test, is evaluating retrieval and generation separately with the right metric for each, and knowing the arithmetic well enough to compute recall@k, MRR, and nDCG by hand.

## Split the pipeline, then measure each half

```flow
dir: LR
q: Query | actor
ret: Retriever | model
chunks: Top-k chunks | store
gen: Generator | model
ans: Answer | step
q -> ret : question
ret -> chunks : ranked list
chunks -> gen : context
q -> gen : question
gen -> ans : grounded answer
ret --> chunks : retrieval metrics
gen --> ans : generation metrics
```

Measure retrieval first. If the answer text never entered the context, no prompt or model change on the generation side can produce a correct answer, so retrieval is the first suspect and generation is tuned only once retrieval is good enough. Most teams get this backwards and spend weeks on the prompt against a retrieval defect.

## Retrieval metrics, with the arithmetic

You need a labelled set: each query paired with the ids of the chunks that actually contain the answer (the relevant set). Three metrics, in rising sophistication.

**Recall@k** is the fraction of relevant chunks that appear in the top k. For a query with one relevant chunk, recall@k is simply 1 if that chunk is in the top k and 0 otherwise, averaged over the query set. It answers: did we even fetch the answer.

**MRR**, mean reciprocal rank, rewards putting the first relevant hit high. For each query take the reciprocal of the rank of the first relevant result (1/rank), then average over queries. It cares only about the first hit.

**nDCG@k**, normalised discounted cumulative gain, is the ranking metric for graded relevance: a highly relevant chunk ranked first is worth more than the same chunk ranked tenth, and partially relevant chunks earn partial credit. It discounts gain by position and normalises against the ideal ordering so the score lands in 0 to 1.

### Worked example

Five queries. For each, the rank at which the first relevant chunk appears in the retrieved list:

| Query | First relevant at rank | In top 5 | Reciprocal rank |
|---|---|---|---|
| Q1 | 1 | yes | 1.000 |
| Q2 | 3 | yes | 0.333 |
| Q3 | not in top 10 | no | 0.000 |
| Q4 | 2 | yes | 0.500 |
| Q5 | 6 | no | 0.167 |

Recall@5 = relevant-found-in-top-5 over queries = 3 / 5 = 0.60. MRR = (1.000 + 0.333 + 0.000 + 0.500 + 0.167) / 5 = 2.000 / 5 = 0.40. Note how they disagree: Q5 counts for MRR (rank 6 gives 0.167) but not for recall@5. That disagreement is the point, recall@k asks did we fetch it within k, MRR asks how high was the first hit.

### nDCG in one worked step

Take one query, k = 3, with graded relevances of the retrieved items being 3, 2, 0 (on a 0 to 3 scale). DCG uses gain over log of position: 3/log2(2) + 2/log2(3) + 0/log2(4) = 3/1 + 2/1.585 + 0 = 3 + 1.262 = 4.262. The ideal ordering of those same relevances is 3, 2, 0 already, so IDCG = 4.262 and nDCG = DCG / IDCG = 1.0. Had the retriever returned them as 0, 2, 3 instead, DCG = 0 + 2/1.585 + 3/2 = 1.262 + 1.5 = 2.762, giving nDCG = 2.762 / 4.262 = 0.65. Same chunks, worse order, lower score, which is exactly what MRR and recall@k cannot see.

## Generation metrics

Once the right chunks are in context, score the answer. The four metrics popularised by RAGAS (Es et al., EACL 2024) split cleanly by layer:

| Metric | Question it answers | Layer |
|---|---|---|
| Context precision | Are the retrieved chunks relevant, and ranked well | retrieval |
| Context recall | Did retrieval fetch everything needed to answer | retrieval |
| Faithfulness | Is every claim in the answer supported by the context | generation |
| Answer relevance | Does the answer actually address the question | generation |

Faithfulness is the hallucination guard: a claim fluent and confident but unsupported by any retrieved chunk is the classic RAG hallucination. Answer relevance catches the opposite, a faithful but evasive answer that never addresses the question.

> **Pitfall.** A high faithfulness score with low context recall. The generator is answering coherently from partial context, so it looks grounded while silently omitting half the answer. Faithfulness alone cannot catch a retrieval gap, which is why you measure context recall beside it.

## Component vs end-to-end

Component metrics localise the bug, end-to-end tells you whether the user got a good answer. Run both. A worked split: context recall 0.62, faithfulness 0.91, end-to-end answer-correctness 0.70. Reading it, the generator is faithful but the retriever is dropping needed chunks on multi-hop questions, so the fix is retrieval, not the prompt, even though faithfulness looked healthy.

```recall
Q: Why measure retrieval before generation when debugging a wrong RAG answer?
A: If the answer chunk never entered the context, no generation change can produce a correct answer. Retrieval is the gating stage, so you confirm it is good before tuning the prompt.
Q: Recall@5 is 0.60 but MRR is 0.40 on the same set. How can both be true?
A: Recall@5 counts only hits within the top five, while MRR credits the first relevant hit at any rank by its reciprocal. A query whose first hit is at rank six adds to MRR but not to recall@5.
Q: What does nDCG capture that recall@k and MRR miss?
A: Order and graded relevance across the whole top k. nDCG rewards putting more-relevant chunks higher and gives partial credit, so it drops when the same chunks are returned in a worse order.
Q: Faithfulness is 0.91 but users still get incomplete answers. Which metric exposes it?
A: Context recall. A high faithfulness score only means the answer is grounded in what was retrieved, not that retrieval fetched everything, so a low context recall reveals the gap.
Q: Why run both component and end-to-end evals instead of one?
A: Component metrics localise which stage failed; end-to-end confirms the user actually got a good answer. One without the other either hides the bug or hides whether it mattered.
```

===DEEPER===

### DCG, IDCG, and why the log discount

Discounted cumulative gain sums the relevance of each result divided by a position discount, and the standard discount is log base 2 of (position + 1), so position 1 divides by log2(2) = 1, position 2 by log2(3) = 1.585, position 3 by log2(4) = 2, and so on. The log makes the penalty for being one rank lower shrink as you go down the list, which matches how users read: the gap between rank 1 and rank 2 matters far more than the gap between rank 20 and rank 21. IDCG is the DCG of the ideal ordering, the same relevances sorted best-first, and nDCG = DCG / IDCG normalises every query to 0 to 1 so queries with different numbers of relevant items are comparable. Without normalisation a query with five relevant chunks would dominate the average over a query with one, purely by having more gain to accumulate.

### Choosing among the three retrieval metrics

Use recall@k when any correct chunk anywhere in the top k is enough, which is the common RAG case because the generator reads all k. Use MRR when the first hit is what matters, for example a single-answer lookup where the user stops at the first good result. Use nDCG when relevance is graded, not binary, and ranking order inside the top k affects quality, for example when the generator weights earlier chunks more or when you truncate aggressively. For most RAG tuning, recall@k is the primary dial because it directly answers whether the generator will even see the answer, and nDCG is the secondary dial once recall is adequate and you want to tighten ordering for lost-in-the-middle effects.

### Judge-scored generation metrics need their own eval

Faithfulness, answer relevance, and context precision as computed by RAGAS are themselves LLM-judge scores, which means they inherit the biases of LLM-as-judge: position, verbosity, self-preference, and run-to-run variance. Before trusting them as a gate, validate the judge against human labels on a sample and measure its agreement, the same discipline the LLM-as-judge lesson sets out. A faithfulness number is a measurement from an instrument that itself needs calibrating, not ground truth. The RAGAS framework (Es, James, and collaborators, presented at EACL 2024) formalised these four metrics; re-check the current library and its metric definitions, this space moves fast (as of 2026, re-check).

### Where end-to-end answer-correctness fits

End-to-end answer-correctness compares the final answer to a reference answer, usually with a judge or a semantic-similarity score plus an exact-fact check. It is the number closest to user value, but it is the worst at localisation, so treat it as the headline metric you report and the component metrics as the diagnostics you act on. A rise in end-to-end with a drop in context recall, for instance, is a warning that the generator is compensating for a weak retriever by leaning on its parametric memory, which will fail silently on anything outside its training data.
