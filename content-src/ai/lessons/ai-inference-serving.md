---
id: ai-inference-serving
chapter: ai-production
title: Serving models
minutes: 8
---
Serving is where throughput, latency, and GPU memory collide. The engineering that makes self-hosting viable is continuous batching and paged attention, and the arithmetic that decides whether a model even fits is weights plus KV cache against GPU memory. Interviewers ask this to see whether you can size a deployment, explain why vLLM-style serving is faster, and say honestly when to self-host versus call an API.

## Continuous batching

Static batching groups a fixed set of requests, runs them together, and waits for the slowest before starting the next batch, so the GPU idles while short requests wait on a long one. Continuous batching (also called in-flight batching) instead admits and evicts requests at the token level: as soon as one request finishes a token or completes, a waiting request takes its slot. The GPU stays busy, which raises throughput sharply under mixed request lengths.

```flow
dir: LR
q: Request queue | store
sched: Scheduler | gate
gpu: GPU decode step | model
done: Finished | step
q -> sched : admit
sched -> gpu : batched step
gpu -> sched : token done
gpu -> done : sequence done
done --> sched : free slot
```

## Paged attention

The KV cache for each request grows as it generates and its final length is unknown in advance, so naive serving reserves the maximum, wasting most of it to fragmentation. PagedAttention, introduced by vLLM (Kwon et al., SOSP 2023), borrows OS virtual-memory ideas: the KV cache is split into fixed-size blocks allocated on demand and referenced through a block table, so memory is used only as sequences grow. The paper reports vLLM improves throughput by 2 to 4x at the same latency versus prior systems like FasterTransformer and Orca, with the gain larger for longer sequences.

> **Key idea.** PagedAttention removes KV-cache fragmentation so more requests fit in memory at once; continuous batching keeps the GPU busy serving them. Together they are why a modern server beats a naive one by several times.

## GPU memory arithmetic

A model fits when weights plus KV cache plus activation overhead fit in GPU memory.

Weights: parameters x bytes per parameter. A 7B model at FP16 (2 bytes) needs about 14 GB just for weights; at 4-bit (0.5 byte) about 3.5 GB.

KV cache per token: 2 (key and value) x layers x hidden size x bytes, summed per token across the batch.

```stack
title: 7B FP16 on a 24GB GPU (illustrative)
unit: GB
Weights FP16 | 14 | fixed
KV cache | 6 | grows with tokens x batch
Activations and overhead | 2
Free headroom | 2
```

The KV cache is what caps your batch size and context length: once weights are loaded, the remaining memory divided by per-token KV cost sets how many tokens-across-requests you can hold. This is the single most useful back-of-envelope in a serving interview.

## Quantization and parallelism

| Technique | Buys | Cost |
|---|---|---|
| Quantization (8-bit, 4-bit) | Smaller weights, more KV room | Possible quality loss |
| Tensor parallelism | A model too big for one GPU | Inter-GPU communication |
| Continuous batching | Throughput | Scheduler complexity |
| PagedAttention | Memory efficiency, batch size | Serving stack support |

Quantization shrinks weights (and sometimes the KV cache) so a model fits a smaller GPU or leaves more room for batch; aggressive quantization can cost accuracy, so measure. Tensor parallelism splits a single model's layers across GPUs when it is too large for one, at the price of communication between them.

## Throughput versus latency

Larger batches raise throughput (tokens per second across all requests) but can raise per-request latency, because each decode step now does more work and a request may wait for a batch slot. Serving is a dial between the two: an interactive chatbot optimizes for low per-request latency with modest batches, a bulk pipeline maximizes batch size for throughput and tolerates higher per-request latency.

## When to self-host

> **Rule of thumb.** Call an API until volume, data-residency, latency floors, or a custom or fine-tuned model force self-hosting. Self-hosting trades a per-token bill for GPUs you must provision, keep busy, and operate.

Self-hosting wins when you have sustained high volume (so the GPUs stay utilized), a custom or fine-tuned model an API will not host, hard data-residency rules, or a latency floor an API cannot meet. It loses when traffic is spiky or low, because idle GPUs are pure cost, and because you now own batching, scaling, and uptime.

> **Interview.** Explain continuous batching (token-level admission keeps the GPU busy) and PagedAttention (block-allocated KV cache removes fragmentation, 2 to 4x throughput in the vLLM paper), do the weights-plus-KV memory arithmetic, then give the self-host decision rule tied to utilization.

```recall
Q: Why does continuous batching beat static batching under mixed request lengths?
A: Static batching waits for the slowest request in a batch, idling the GPU on short ones. Continuous batching admits waiting requests into freed slots at the token level, so the GPU stays busy.
Q: What problem does PagedAttention solve and what is the reported win?
A: It removes KV-cache memory fragmentation by allocating fixed-size blocks on demand instead of reserving the maximum per request, letting more requests fit. The vLLM paper reports 2 to 4x throughput at the same latency versus prior systems.
Q: A 7B FP16 model is on a 24GB GPU. What sets the maximum batch and context?
A: Weights take about 14GB fixed. The remaining memory minus activation overhead, divided by the per-token KV-cache cost, sets how many tokens across all in-flight requests you can hold.
Q: How does quantization help serving beyond just fitting the model?
A: Smaller weights free GPU memory, which can go to a larger batch (more throughput) or longer context (bigger KV cache). The risk is accuracy loss, so it must be measured.
Q: When does self-hosting beat calling an API?
A: Sustained high volume that keeps GPUs utilized, a custom or fine-tuned model an API will not serve, hard data-residency rules, or a latency floor an API cannot meet. Spiky or low traffic favors the API, since idle GPUs are wasted cost.
```

===DEEPER===

## The KV cache formula in full

Per-token KV-cache bytes = 2 x num_layers x num_kv_heads x head_dim x bytes_per_element. The factor 2 is key and value; bytes_per_element is 2 for FP16. For a model with 32 layers, hidden size 4096, and FP16, a single token's KV cache across all layers is roughly 2 x 32 x 4096 x 2 bytes = about 512 KB per token (with full multi-head attention). Multiply by sequence length and by concurrent requests to size the cache. Grouped-query attention (GQA) and multi-query attention (MQA) shrink this by sharing key-value heads across query heads, cutting num_kv_heads and so the per-token cost, which is a major reason long-context serving is feasible. This formula, not the weights, is usually what limits how many users you can serve at once.

## Prefill and decode scheduling

A subtle serving decision is how to interleave prefill (compute-bound, processes a whole prompt at once) and decode (memory-bandwidth bound, one token per step per request). Mixing a large prefill into a batch of decodes can stall the decoders and spike their inter-token latency. Modern servers use chunked prefill, splitting a long prompt's prefill into pieces interleaved with ongoing decodes, to keep inter-token latency smooth. This is why a single very long prompt arriving can briefly degrade everyone else's streaming unless the scheduler is designed for it.

## Choosing a serving stack

vLLM popularized PagedAttention and continuous batching and is a common default for self-hosted open-weight models (verify current capabilities, as of 2026). Other stacks (TensorRT-LLM, TGI, SGLang and others) make different throughput, latency, and hardware trade-offs. The selection criteria that matter: supported quantization formats, tensor and pipeline parallelism for large models, LoRA multi-adapter serving if you ship adapters, structured-output and tool-call support, and observability hooks. Benchmark on your own request distribution, because the published throughput numbers assume request-length mixes that may not match yours. The serving lesson pairs with the latency lesson: the server decides throughput and the batching dial, while the latency lesson covers the per-request budget and streaming the server feeds.
