---
id: ai-attention-kv
chapter: ai-foundations
title: Attention and the KV cache
minutes: 8
---
Self-attention is how a transformer lets every token look at every other token. The KV cache is the engineering trick that makes generation affordable by not recomputing that look-back on every step. You need both to explain why prefill is expensive, why decode is slow for a different reason, and why long context and prompt caching behave the way they do. Interviewers use this to tell people who have only used the API from people who understand what it costs.

## Self-attention without the heavy math

For each token the model builds three vectors: a query (what am I looking for), a key (what do I offer), and a value (what I pass on). A token attends to another by comparing its query to that token's key; the better the match, the more of that token's value it pulls in. In a causal language model a token can only attend to earlier tokens, never later ones.

The cost: comparing every token's query against every token's key is an n by n operation for a sequence of length n. That quadratic term is why processing a long input (prefill) gets expensive fast.

```flow
dir: LR
tok: New token | step
q: Query | model
kv: Cached K and V | store
att: Attend | model
out: Next-token logits | model
tok -> q : project
q -> att : query
kv -> att : all past K, V
att -> out : weighted values
```

## Prefill is quadratic, decode reuses the cache

- Prefill: process the whole prompt at once. Attention is roughly O(n squared) in the prompt length n, done in one parallel pass.
- Decode: generate one token at a time. The new token's key and value are the same on every future step, so you compute them once and store them. That store is the KV cache. Each new token attends to the cached K and V plus itself, so per-step work is O(current length), not O(n squared) all over again.

Without the cache, generating the t-th token would recompute attention over all t previous tokens from scratch every step, turning generation into an O(n cubed) disaster. The cache turns it into roughly O(n squared) total.

```check
Q: A chat already holds 10,000 tokens and the model has a KV cache. What does the next decode step compute?
- Keys and values again for all 10,000 earlier tokens
* The new token K and V, then attention over the cache
- Attention over only the last few hundred tokens
Why: The cache stores the keys and values of every earlier token, so one decode step computes them only for the new token and then attends over all the cached ones. Recomputing all 10,000 is exactly the work the cache removes. Standard attention still reads every cached token, so each step must stream the whole cache from memory, which is why decode is memory-bandwidth bound.
```

## KV cache size, with a worked example

The cache stores one key and one value vector per token, per layer, per KV head. Size in elements is:

```text
kv_elements = 2 * layers * kv_heads * head_dim * seq_len
kv_bytes    = kv_elements * bytes_per_element
```

Worked example (illustrative architecture): 32 layers, 8 KV heads, head_dim 128, 2 bytes per element (fp16), sequence length 8192.

```text
2 * 32 * 8 * 128 * 8192 = 536,870,912 elements
536,870,912 * 2 bytes   = ~1.07 GB  per sequence
```

Over a billion elements, about a gigabyte, for one 8k sequence. Multiply by the number of concurrent requests in a batch and the KV cache, not the model weights, often becomes the memory bottleneck for serving.

```bars
title: Where decode-time memory traffic goes (illustrative)
unit: relative
KV cache reads | 8
Weight reads | 3
Activations | 1
```

## Why decode is memory-bandwidth bound

During decode you generate one token at a time, so the matrix multiplies are tall-and-skinny: little arithmetic per step, but you must stream the growing KV cache (and the weights) out of memory on every single token. The bottleneck is how fast you can move bytes, not how fast you can multiply. This is the opposite of prefill, which is compute-bound. It is also why longer contexts slow decode: more KV to stream each step.

> **Key idea.** Prefill is compute-bound and scales with input length squared. Decode is memory-bandwidth-bound and scales with how much KV cache it must stream per token. Different bottleneck, different fix.

## GQA and MQA in one paragraph

Multi-query attention (MQA, Shazeer 2019) and grouped-query attention (GQA, Ainslie et al. 2023, arXiv 2305.13245) shrink the KV cache by having many query heads share a smaller number of key and value heads. MQA uses a single shared KV head; GQA uses a few groups, a middle ground that keeps most of the quality of full multi-head attention while cutting KV memory and the bandwidth you must stream at decode. The GQA paper frames the gain exactly as reducing the memory bandwidth from loading keys and values. Most current open-weight models use GQA.

> **Interview.** Asked why long context is expensive, separate the two costs: prefill compute grows with input squared, and the KV cache grows linearly with length and must be streamed every decode step. GQA and prompt caching each attack one of these.

```recall
Q: Why is prefill compute-bound but decode memory-bandwidth-bound?
A: Prefill does a large parallel matmul over the whole prompt (lots of arithmetic). Decode does one tiny step at a time but must stream the whole KV cache and weights from memory each token, so bandwidth, not compute, is the limit.
Q: What does the KV cache store, and why does storing it help?
A: The key and value vectors for every past token, per layer and KV head. They never change, so caching them avoids recomputing attention over the whole history on every new token.
Q: An 8k-token sequence needs about a gigabyte of KV cache here. What is the serving consequence?
A: With many concurrent requests the KV cache, not the weights, dominates GPU memory and caps batch size, so throughput is bounded by cache memory and bandwidth.
Q: What problem do GQA and MQA solve, and how?
A: They cut KV cache size and decode-time bandwidth by sharing fewer key/value heads across many query heads, keeping most quality.
```

===DEEPER===

### The attention formula and the mask

Scaled dot-product attention is:

```text
Attention(Q, K, V) = softmax( (Q K^T) / sqrt(d_k) ) V
```

Q, K, V are matrices of per-token query, key, value vectors; d_k is the head dimension and the sqrt term keeps the dot products from growing with dimension and saturating the softmax. The Q K^T product is the n by n score matrix, the source of the quadratic cost. Causal masking sets the upper triangle of that matrix to minus infinity before softmax, so a token cannot attend to the future. Multi-head attention runs this in parallel across h heads with separate projections, then concatenates.

### Why the cache makes decode O(n squared) total, not O(n cubed)

At decode step t, with the cache you compute one new query, one new key, one new value, and attend over t cached entries: O(t) work. Summing t from 1 to n gives O(n squared) total. Without the cache you would recompute all t keys and values each step: O(t squared) per step, summing to O(n cubed). The cache trades memory (storing all past K and V) for a factor of n in compute, which is almost always the right trade for autoregressive generation.

### Prompt caching builds on the KV cache

Provider prompt caching reuses the KV entries for a shared prefix across requests, so a long, stable system prompt or tool schema is prefilled once and read back cheaply on later calls. It is the same KV cache idea, lifted from within one request to across requests. This is why ordering a prompt with the stable part first matters: only a matching prefix can be reused. See the prompt-caching lesson for breakpoints, TTL, and the write-premium-versus-read-discount cost model.

### Beyond GQA

Further reductions include multi-head latent attention (MLA), which compresses K and V into a low-rank latent and reconstructs them, and cross-layer or multi-layer KV sharing, which reuses cache entries across layers. These are active research as of 2026 (several arXiv lines in 2024 to 2026); the common thread is the same pressure, the KV cache and its bandwidth are the decode-time bottleneck, so shrink what you must store and stream.
