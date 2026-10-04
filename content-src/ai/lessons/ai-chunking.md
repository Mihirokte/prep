---
id: ai-chunking
chapter: ai-patterns
title: Chunking and indexing for retrieval
minutes: 8
---
Chunking is how you cut documents into the pieces you embed and retrieve. It decides retrieval quality more than the choice of vector store does, yet it has no universal best answer, so interviewers use it to see whether you reason from the mechanism or recite a number. The core tension is simple: a chunk too small loses the context that makes it answerable, a chunk too large averages many topics into one blurry vector.

## Why chunk size is a trade-off

An embedding is one vector for the whole chunk. Put a single focused idea in it and the vector points cleanly at that idea. Put three unrelated paragraphs in it and the vector lands at their average, close to nothing and retrievable for nothing. That is the large-chunk failure. The small-chunk failure is the opposite: a sentence like revenue grew three percent is a crisp vector that matches a query about revenue, but once retrieved it cannot answer which company or which quarter, because that context lived in a neighbouring chunk that did not come along.

> **Key idea.** You embed what you retrieve. The chunk is both the unit of similarity and the unit of context handed to the model, and those two jobs pull chunk size in opposite directions.

Overlap softens the boundary problem. If chunks share ten to fifteen percent of their tokens, a sentence split across a boundary still lands whole inside at least one chunk, so retrieval does not miss it because of where the cut fell.

## The chunking strategies, floor to ceiling

```steps
Fixed | Cut every N tokens regardless of content. The naive floor, fast, splits mid-sentence and mid-table.
Recursive | Split on a priority of separators, paragraph then line then sentence, so cuts land at natural breaks.
Structural | Respect the document structure, headings, list items, code blocks, table rows, so a unit stays intact.
Semantic | Start a new chunk when the embedding of the next sentence drifts far from the running topic.
```

Recursive splitting is the sensible default for mixed prose. Structural splitting wins on Markdown, HTML, and code, where the format already marks the right boundaries. Semantic chunking sounds principled but costs an embedding call per sentence and rarely beats a well-tuned recursive splitter enough to justify that, so reach for it only when you have measured a gap.

## Small-to-big: retrieve small, read big

A strong pattern decouples the two jobs the chunk was overloading. Index small, precise child chunks so similarity is sharp. Attach each child to a larger parent (its section, or a window of neighbouring chunks). Retrieve on the children, then hand the model the parents. You get the retrieval precision of small chunks and the reading context of large ones.

```flow
dir: LR
q: Query | actor
idx: Child chunk index | store
par: Parent lookup | store
llm: LLM | model
q -> idx : embed and search
idx -> par : child ids
par -> llm : full parent sections
q -> llm : question
llm -> q : grounded answer
```

## Contextual retrieval: give each chunk its context before embedding

Anthropic's Contextual Retrieval (2024) attacks the small-chunk failure directly. Before embedding a chunk, prepend a short, model-written line that situates it in its source document, for example this chunk is from the Q3 2023 refund-policy memo, discussing the thirty-day window. Now the vector carries the company and quarter the raw sentence had lost. Anthropic measured a thirty-five percent reduction in top-twenty retrieval failures from contextual embeddings alone, forty-nine percent when they also ran BM25 over the contextualised chunks, and sixty-seven percent when a reranker was added on top (Anthropic, Introducing Contextual Retrieval, 2024). Prompt caching the shared document prefix is what makes generating one context line per chunk affordable at corpus scale.

```python
# Sketch: contextual chunk augmentation before embedding
def contextualize(doc_text, chunk):
    prompt = (f"Document:\n{doc_text}\n\n"
              f"Chunk:\n{chunk}\n\n"
              "Write one sentence placing this chunk in the document. "
              "Name the subject and any date or entity it refers to.")
    context = client.generate(prompt)      # sketch; cache the doc prefix
    return context + "\n" + chunk          # embed THIS, not the raw chunk
```

## Metadata and re-indexing

Store structured fields beside each vector, source id, title, section, date, author, access tags. They enable filtered search (restrict to one tenant, one product, documents newer than a date) and feed citations. Two operational facts bite teams late. First, if you change the embedding model you must re-embed the entire corpus, because vectors from two models are not comparable. Second, a growing or editing corpus needs an incremental re-indexing path, add, update, delete by document id, so you are not rebuilding the whole index on every change.

> **Pitfall.** Shipping a chunking choice without measuring recall at k on your own eval set. There is no confirmed best size, so a number copied from a blog is a guess. Start near three hundred to five hundred tokens with overlap, then tune against your data.

```recall
Q: Why can a chunk that is too large hurt retrieval even though it contains the answer?
A: The embedding averages every topic in the chunk, so the vector points at none of them clearly and ranks poorly for a focused query. The answer is present but unretrievable.
Q: What problem does small-to-big (parent-child) chunking solve, and how?
A: It separates the retrieval unit from the reading unit. You embed small child chunks for sharp similarity, then hand the model the larger parent for context, getting precision and context at once.
Q: Why does contextual retrieval prepend a model-written line before embedding instead of after?
A: The vector is computed from the chunk text, so the context must be in the text at embed time to shape the vector. Added after retrieval it would help reading but not finding.
Q: You switched embedding models. What must happen to the existing index, and why?
A: Re-embed the entire corpus. Vectors from different models live in different spaces and are not comparable, so old and new vectors cannot be searched together.
Q: Why is overlap between chunks worth the extra storage?
A: A sentence or fact split across a chunk boundary still lands whole in at least one chunk, so retrieval does not miss it purely because of where the cut happened to fall.
```

===DEEPER===

### Recursive splitting, concretely

A recursive splitter is given an ordered separator list, for prose typically paragraph break, then newline, then sentence end, then space. It tries to split the document on the first separator. Any resulting piece still larger than the target size is split again on the next separator down, and so on, until every piece fits. The effect is that cuts prefer the strongest available boundary and fall back to weaker ones only when forced, so you rarely slice mid-sentence unless a single sentence already exceeds the target. This is why recursive splitting beats fixed-size cutting at almost no extra cost, and why it is the common default in retrieval libraries.

### Sizing against the downstream budget

Chunk size is not only a retrieval parameter, it is a token-budget parameter. If you retrieve the top five chunks at five hundred tokens each, that is twenty-five hundred tokens of context before the system prompt, history, and question. Double the chunk size and you either halve k or double the context cost. So the real decision couples three numbers: chunk size, k, and the context budget you are willing to spend per call. Small-to-big complicates this usefully, you can search over, say, twenty small children but expand to only the three distinct parents they belong to, keeping precision high while bounding the tokens that reach the model.

### Measuring before tuning

The honest workflow is retrieval-first evaluation. Build a small set of question and known-answer-location pairs. For a candidate chunking configuration, compute recall at k, the fraction of questions whose answer chunk appears in the top k retrieved. Sweep chunk size, overlap, and strategy and keep the configuration that maximises recall at your chosen k, not the one a blog recommends. Only after retrieval is good do you tune the generation prompt, because if the answer never enters the context no prompt can recover it. This ordering, retrieval metrics before generation metrics, is the single most repeated lesson in production RAG and the one interviewers most want to hear.

### Edge cases that break naive chunking

Tables and code are the usual casualties of fixed-size splitting, a table cut in half loses its header row and becomes meaningless, and a function cut mid-body cannot be understood. Structural splitting that treats a table or a code block as an atomic unit (or falls back to keeping the header with each row group) handles these. Very long single elements, a page-long table, a giant function, still need a policy, usually split with the header or signature repeated into each piece so context survives the cut.
