---
id: ai-tokens
chapter: ai-foundations
title: Tokens, context windows, and cost
minutes: 8
---
A model never sees your text. It sees tokens: integer ids for sub-word pieces produced by a tokenizer. Everything downstream, context limits, latency, and the bill, is counted in tokens, not words or characters. Interviewers probe this because an engineer who thinks in words will mis-size a window, under-budget cost, and be surprised when non-English input costs double.

## How tokenization works

Most frontier models use byte-pair encoding (BPE) or a close variant. BPE starts from raw bytes and repeatedly merges the most frequent adjacent pair into a new symbol, learning a fixed vocabulary (tens of thousands of tokens) from a training corpus. Common words become one token; rare words split into pieces; arbitrary bytes always have a fallback, so nothing is unencodable.

A rough rule for English: 1 token is about 4 characters, or about 0.75 words. So 1000 tokens is roughly 750 English words. This ratio is only a heuristic. Code, punctuation, numbers, and non-English scripts break it.

> **Rule of thumb.** For English prose, tokens are about 1.33x the word count. Treat this as an estimate for budgeting, then measure with the real tokenizer before you quote a cost.

## Context window: input plus output share one budget

The context window is the maximum number of tokens the model can attend to in a single call, and it is shared by input and output. If the window is 200k tokens and your prompt is 190k, you have at most 10k tokens of output left. Many APIs let you cap output with a `max_tokens` parameter; set it, because an uncapped generation can run until it hits the window and bill you for every token.

```stack
title: What fills a 200k token window (illustrative)
unit: k tokens
System prompt | 2 | fixed, cacheable
Tool schemas | 6 | fixed, cacheable
Retrieved chunks | 24 | per query
Chat history | 40 | grows every turn
User message | 1
Output reserve | 8
```

The chat-history segment is the dangerous one: it grows every turn, so a long conversation silently eats the budget retrieval and output need. This is why agents compact history and why RAG trims to top-k chunks instead of stuffing documents.

## Prefill and decode: two different costs

A request runs in two phases.

- Prefill: the model processes the whole input in parallel to build its internal state. This is compute-heavy but one pass.
- Decode: the model generates output one token at a time, each token depending on all previous ones. This is sequential.

```flow
dir: LR
in: Input tokens | actor
pre: Prefill pass | model
dec: Decode loop | model
out: Output tokens | actor
in -> pre : full prompt
pre -> dec : state ready
dec -> dec : one token
dec -> out : stream
```

The split matters for both latency and price. Time to first token is dominated by prefill (how long your input is). Time between tokens is dominated by decode. Providers often price input and output tokens differently, with output more expensive, because decode is the slower, serial phase.

## Why cost and latency scale with tokens

Every token in the window is processed, so doubling the prompt roughly doubles prefill work, and every extra output token is another serial decode step. There is no free context: a longer system prompt is paid on every single call. This is the core reason retrieval beats dumping everything into a huge window, and the reason prompt caching exists.

## Worked cost arithmetic (illustrative)

Do not quote live per-token prices as fact, they move. Reason in ratios. Suppose a provider charges input at 1 unit per 1k tokens and output at 3 units per 1k tokens (illustrative).

| Call | Input tokens | Output tokens | Cost (units) |
|---|---|---|---|
| Short Q and A | 500 | 200 | 0.5 + 0.6 = 1.1 |
| RAG answer | 6000 | 400 | 6.0 + 1.2 = 7.2 |
| Long agent turn | 40000 | 800 | 40.0 + 2.4 = 42.4 |

The agent turn costs almost 40x the short one, and nearly all of it is input. The lesson: input length is usually the cost driver in retrieval and agent systems, which is exactly what prompt caching attacks.

## Non-English and code inflate token counts

A tokenizer trained mostly on English spends more tokens per unit of meaning on other languages, because their characters and words were not merged into efficient single tokens. The same sentence can cost roughly 2x to 3x the tokens in some languages versus English, and far more for scripts far from the training distribution. Code also tokenizes less efficiently than prose because of punctuation, indentation, and identifiers.

```python
# Sketch: always measure, do not guess
enc = tokenizer_for(model)              # the model's own tokenizer
n_in = len(enc.encode(prompt))          # count before sending
budget = window - n_in - output_reserve # tokens left for the model
assert budget > 0, "prompt too large for the window"
```

> **Pitfall.** Estimating a non-English or code-heavy prompt with the English words-times-1.33 rule. You will under-count tokens, overflow the window, or under-budget cost. Count with the model's tokenizer.

```recall
Q: Input and output share one window. Why does an uncapped max_tokens risk a surprise bill?
A: Generation can run until it hits the window, so you pay for every output token up to that cap, and output tokens are usually the pricier kind. Set max_tokens.
Q: Why does a longer system prompt cost more than its one-time size suggests?
A: It is part of the input on every single call, so its token cost is paid per request, not once.
Q: Why does the same text cost more tokens in some non-English languages?
A: The tokenizer learned efficient merges mostly from English, so other scripts split into more, smaller tokens, inflating the count 2x to 3x or more.
Q: In a RAG or agent request, where does most of the cost usually come from?
A: Input tokens (retrieved context, history, tool schemas), which is why prompt caching and retrieval trimming matter more than shortening the answer.
```

===DEEPER===

### Why BPE, and what the alternatives are

BPE (Sennrich et al., 2016, for NMT; popularised for GPT-2 as a byte-level variant) was chosen because it hits a sweet spot: a fixed vocabulary that keeps common words whole for efficiency, splits rare words into reusable pieces for coverage, and, in its byte-level form, can encode any input at all because every byte is a valid starting symbol. Alternatives include WordPiece (BERT) and Unigram/SentencePiece (used by many multilingual and open models), which pick merges by a probabilistic objective rather than raw frequency. The practical upshot is the same: text to integer ids, with a vocabulary fixed at training time.

### Counting tokens correctly

Use the model's own tokenizer, not a generic one. OpenAI documents its tokenizers (the `tiktoken` library; `o200k_base` for recent GPT-4-class models, `cl100k_base` for older ones). Anthropic exposes a token-counting endpoint so you can measure Claude prompts without a local encoder (as of 2026, re-check). Chat messages also carry a small per-message overhead for role and formatting tokens, so a precise budget adds a few tokens per message on top of the content.

### A sharper cost model

Total cost per call is approximately:

```text
cost = (input_tokens * price_in) + (output_tokens * price_out)
```

Two refinements matter in production. First, with prompt caching the input term splits into a cheap cached-prefix read and a full-price uncached remainder, so ordering the prompt so the stable part comes first can cut the input term substantially (see the prompt-caching lesson). Second, in multi-turn agents the input term grows every turn as history accumulates, so a conversation of N turns can have input cost scaling with N squared if history is never trimmed. Compaction and summarisation exist to break that curve.

### Context window is not free capacity

A larger window raises the ceiling, not the floor on cost. Sending 200k tokens because you can means paying prefill on 200k tokens and, often, worse accuracy as the useful signal gets diluted among distractors (the lost-in-the-middle effect, covered in the RAG-versus-long-context lesson). The window is a limit to respect, not a target to fill.
