---
id: scratch-17-17-disaggregated-prefill-decode
chapter: ai-infrastructure-and-production
title: Disaggregated Prefill/Decode: NVIDIA Dynamo and llm-d
minutes: 0
---
> **Numbers in this lesson are snapshots.** Prices, latencies and vendor details come from 2025-26 sources and change often. Learn the reasoning and the trade-offs; check the vendor page before you quote a figure.

> Prefill is compute-bound; decode is memory-bound. Running both on the same GPU wastes one resource. Disaggregation splits them onto separate pools and transfers KV cache between them over NIXL (RDMA/InfiniBand or TCP fallback). NVIDIA Dynamo (GTC 2025 announce, 1.0 GA at GTC 2026) sits above vLLM/SGLang/TRT-LLM — its Dynamo Profiler + SLA Planner auto-rate-match prefill:decode ratios to meet SLOs. NVIDIA publishes throughput gains in this ballpark — developer.nvidia.com (2025-06) shows a simulated ~6x throughput improvement for DeepSeek-R1 MoE with disaggregated serving (GB200 NVL72 + Dynamo context) in the medium-latency regime, and the Dynamo product page (developer.nvidia.com, undated) advertises up to 50x MoE throughput on GB300 NVL72 + Dynamo vs Hopper. The "30x" figure is NVIDIA's own launch claim (developer.nvidia.com, 2025-03): up to 30x more requests served for DeepSeek-R1 on GB200 NVL72 with Dynamo disaggregated serving, a projected TensorRT-LLM FP4 result at 32K/8K input/output, so treat it as a vendor best case. llm-d (founded by Red Hat, Google Cloud, IBM Research, CoreWeave and NVIDIA; now a CNCF project) is Kubernetes-native: prefill / decode / router as independent Services with per-role HPA. llm-d 0.5 adds hierarchical KV offloading, cache-aware LoRA routing, UCCL networking, scale-to-zero. Economics: internal rollup of multiple customer disclosures suggests 30–40% savings on $2M-class inference spend (i.e., $600-800K/year) when switching from colocated serving to disaggregated with Dynamo at constant SLA; the specific $2M→$600-800K figure is an internal composite, not a single published case study — use it as an order-of-magnitude anchor, not a reference citation. Short prompts (<512 tokens, short output) don't justify the transfer cost.

**Prerequisites:** [Serving models](#/study/ai/ai-inference-serving), [Latency and streaming](#/study/ai/ai-latency)

## Learning Objectives

- Explain why prefill and decode have different optimal GPU allocations and quantify the waste under colocation.
- Diagram the disaggregated architecture: prefill pool, decode pool, KV transfer via NIXL, router.
- Name the condition when disaggregation does NOT pay off (short prompts, short outputs).
- Distinguish NVIDIA Dynamo (stack-above) from llm-d (Kubernetes-native) and match each to an operational context.

## The Problem

You run Llama 3.3 70B on 8 H100s. Under mixed workload (long prompts + short outputs), GPUs idle during decode because most of the compute was spent on prefill. Under different workload (short prompts + long outputs), the opposite happens. Colocated prefill + decode means you over-provision both.

Budget impact: 20-40% of GPU time is wasted on the wrong resource. You are buying H100 compute to run memory-bound decode, or buying H100 HBM bandwidth to run compute-bound prefill. Both are expensive waste.

Disaggregation splits prefill and decode onto separate pools sized for each's bottleneck. KV cache transfers from prefill pool to decode pool via high-bandwidth interconnect.

## The Concept

### Why the bottlenecks differ

**Prefill** — run the transformer over the full input prompt in one forward. Matrix multiplications dominate; compute-bound. H100 SXM FP8 peaks at ~2000 dense TFLOPS (3,958 with sparsity). Batch efficiency is good — one forward processes many tokens.

**Decode** — generate one token at a time, reading the full weights each iteration. Memory-bandwidth-bound. H100 SXM HBM3 gives ~3.35 TB/s. Batch efficiency is good only at high concurrency — the weights read amortizes across the batch.

Colocating them: you buy GPUs optimized for both. H100 is good at both but costs the same either way. At scale, you want prefill pool on H100 / compute-heavy; decode pool on H200 / memory-heavy, or with aggressive quantization.

### The architecture
```
            ┌──────────────┐
  Request → │    Router    │ ───────────────────────┐
            └──────┬───────┘                        │
                   │                                │
                   ▼ (prompt only)                  │
            ┌──────────────┐    KV cache    ┌───────▼──────┐
            │ Prefill pool │ ─── NIXL ────► │ Decode pool  │
            │  (compute)   │                │  (memory)    │
            └──────────────┘                └──────┬───────┘
                                                   │ tokens
                                                   ▼
                                                 Client
```
NIXL is NVIDIA's inter-node transport. Uses RDMA/InfiniBand when available, TCP fallback otherwise. Transfer latency is real — typically 20-80 ms for KV cache of a 4K-token prompt on 70B FP8. This is why short prompts don't justify disaggregation: the transfer tax exceeds the savings.

### Dynamo vs llm-d

**NVIDIA Dynamo** (GTC 2025 announce, 1.0 GA at GTC 2026):
- Sits above vLLM, SGLang, TRT-LLM as an orchestrator.
- Dynamo Profiler measures workload, SLA Planner auto-configures prefill:decode ratios.
- Rust core, Python extensibility.
- Throughput gains: NVIDIA reports a simulated 6x for DeepSeek-R1 MoE with disaggregation in the medium-latency regime (developer.nvidia.com, 2025-06); NVIDIA's launch post claims "up to 30x" more requests served for DeepSeek-R1 on GB200 NVL72 + Dynamo (developer.nvidia.com, 2025-03, projected), a vendor best case.
- GB300 NVL72 + Dynamo: up to 50x MoE throughput vs Hopper per the Dynamo product page (developer.nvidia.com, undated).
- On Kubernetes (via NVIDIA Grove), `topologyConstraint packDomain: rack` packs prefill+decode cliques on the same rack for high-bandwidth KV transfer.

**llm-d** (founded by Red Hat, Google Cloud, IBM Research, CoreWeave and NVIDIA; Kubernetes-native, CNCF project):
- Prefill / decode / router as independent Kubernetes Services.
- Per-role HPA with queue depth (prefill) / KV utilization (decode) signals.
- llm-d 0.5 (2026): hierarchical KV offloading, cache-aware LoRA routing, UCCL networking, scale-to-zero.

Use Dynamo if you want a managed stack-above orchestrator. Use llm-d if you want Kubernetes-native primitives and are committed to the CNCF ecosystem.

### Economics

Internal composite (not a single published case study — order-of-magnitude anchor):

- $2M/year inference spend on colocated serving.
- Switched to disaggregated with Dynamo.
- Same request volume, same P99 latency SLA.
- Reported savings: $600K–$800K/year (30–40% reduction).
- No new hardware.

We synthesize this figure from multiple customer disclosures rather than a single citable case study; closest published data point is Baseten's 2x faster TTFT / 61% higher throughput with Dynamo KV routing (baseten.co, 2025-10), and VAST + CoreWeave's projection of 60–130% more tokens/$ at 40–60% KV hit rate (vastdata.com, 2025-12). The savings come from right-sizing each pool; prefill-heavy workloads (RAG with 8K+ prefixes) benefit more than balanced ones.

### When NOT to disaggregate

- Prompts < 512 tokens and outputs < 200 tokens: transfer tax dominates gain.
- Small cluster (< 4 GPUs): not enough pool diversity.
- Team cannot operate two GPU pools with per-role scaling: Dynamo helps but not trivially.
- No RDMA fabric: TCP transfer tax is heavier.

### The router integrates with [Multi-Region LLM Serving and KV Cache Locality](#/study/ai/scratch-17-11-multi-region-kv-locality)

Disaggregated routers are KV-cache-aware ([Multi-Region LLM Serving and KV Cache Locality](#/study/ai/scratch-17-11-multi-region-kv-locality)). A request lands on the decode pool holding its prefix — if no match, it flows prefill → decode. Hit rate and disaggregation compound — the cache-aware router determines whether a new prefill is even needed.

### MoE on Blackwell is where the real numbers are

NVIDIA claims up to 50x MoE throughput for GB300 NVL72 + Dynamo over Hopper baselines. MoE expert routing is compute-heavy on prefill but memory-heavy on decode (expert caches), so disaggregation is a double win. 2026 frontier model serving is MoE-dominant (DeepSeek-V3/R1, Qwen3 MoE, Llama 4).

### Numbers you should remember

Benchmark numbers drift — NVIDIA and the inference stack post updated results every quarter. Re-check before quoting.

- DeepSeek-R1 with disaggregation (GB200 NVL72 + Dynamo): ~6x simulated throughput vs colocated in the medium-latency regime (developer.nvidia.com, 2025-06); NVIDIA's "up to 30x" more requests served on GB200 NVL72 + Dynamo is a projected vendor best case (developer.nvidia.com, 2025-03).
- GB300 NVL72 + Dynamo: up to 50x MoE throughput vs Hopper (developer.nvidia.com, undated).
- Savings anchor (internal composite, not a single case study): $600-800K/year off a $2M annual spend at constant SLA.
- Disaggregation threshold: prompts >512 tokens + outputs >200 tokens.
- KV transfer via NIXL: 20-80 ms for 4K-prompt KV on 70B FP8.

## Use It

`code/main.py` simulates colocated vs disaggregated serving. Reports throughput, cost per request, and the prompt-length crossover.

## Ship It

This lesson produces `outputs/skill-disaggregation-decider.md`. Given workload and cluster, decides whether to disaggregate.

Source: [AI Engineering from Scratch, phase 17, 17-disaggregated-prefill-decode](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/17-infrastructure-and-production/17-disaggregated-prefill-decode), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why do prefill and decode want different optimal GPU configurations?
A: Prefill is compute-bound on matmul throughput; decode is memory-bound on HBM bandwidth, so colocating them wastes one resource.
Q: What transport does NVIDIA Dynamo use to move KV cache between the prefill and decode pools?
A: NIXL (RDMA/InfiniBand when available, TCP fallback).
Q: When does disaggregation NOT pay off according to the lesson?
A: Prompts under 512 tokens and outputs under 200 tokens, where the KV transfer tax dominates the gain.
Q: What is the core architectural difference between Dynamo and llm-d?
A: Dynamo is a stack-above orchestrator over vLLM/SGLang/TRT-LLM; llm-d is Kubernetes-native with prefill/decode/router as independent Services.
Q: Which Dynamo components automatically tune the prefill:decode ratio for an SLO?
A: Dynamo Profiler and SLA Planner.
Q: How does disaggregation interact with cache-aware routing from Phase 17 · 11?
A: The cache-aware router can land a request on the decode pool already holding its prefix; on miss it flows prefill -> decode, so the two compound.
```

===DEEPER===
## Exercises

1. Run `code/main.py`. At what prompt length does disaggregation beat colocation?
2. Design the prefill pool and decode pool for a RAG service with P99 prefix length 8K, output 300.
3. Dynamo vs llm-d: pick one for a pure-Kubernetes shop with no Python runtime preference.
4. Compute KV transfer cost: 4K prefill on 70B FP8 = ~500 MB KV. At RDMA 100 GB/s, transfer = 5 ms. At TCP 10 GB/s = 50 ms. Which matters for your SLA?
5. MoE expert routing changes KV access patterns. How does disaggregation behave with MoE that activates different experts per token?

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|------------------------|
| Disaggregated serving | "split prefill/decode" | Separate GPU pools for each phase |
| NIXL | "NVIDIA transport" | Dynamo's inter-node KV transfer (RDMA/TCP) |
| NVIDIA Dynamo | "the orchestrator" | Stack-above coordinator for vLLM/SGLang/TRT-LLM |
| llm-d | "Kubernetes native" | Red Hat-founded K8s disaggregated stack (CNCF) |
| Dynamo Profiler | "Dynamo auto-config" | Measures workload, configures pool ratios |
| SLA Planner | "Dynamo policy" | Auto-rate-matches prefill:decode to meet SLOs |
| `packDomain: rack` | "Dynamo/Grove topology" | Pack prefill+decode on same rack for fast KV |
| UCCL | "unified collective" | Unified Collective Communication Library; NIXL transport backend added in llm-d 0.5 for congestion-resilient KV transfer |
| MoE expert routing | "expert per token" | DeepSeek-V3 pattern; disaggregation helps |

## Further Reading

- [NVIDIA — Introducing Dynamo](https://developer.nvidia.com/blog/introducing-nvidia-dynamo-a-low-latency-distributed-inference-framework-for-scaling-reasoning-ai-models/)
- [NVIDIA — Disaggregated LLM Inference on Kubernetes](https://developer.nvidia.com/blog/deploying-disaggregated-llm-inference-workloads-on-kubernetes/)
- [TensorRT-LLM Disaggregated Serving blog](https://nvidia.github.io/TensorRT-LLM/blogs/tech_blog/blog5_Disaggregated_Serving_in_TensorRT-LLM.html)
- [llm-d GitHub](https://github.com/llm-d/llm-d)
- [llm-d 0.5 release notes](https://github.com/llm-d/llm-d/releases)
