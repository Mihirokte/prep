---
id: scratch-17-12-edge-inference
chapter: ai-infrastructure-and-production
title: Edge Inference: Apple Neural Engine, Qualcomm Hexagon, WebGPU/WebLLM, Jetson
minutes: 0
---
> **Numbers in this lesson are snapshots.** Prices, latencies and vendor details come from 2025-26 sources and change often. Learn the reasoning and the trade-offs; check the vendor page before you quote a figure.

> The core edge constraint is memory bandwidth, not compute. Mobile DRAM sits at 50-90 GB/s; datacenter HBM3 clears 2-3 TB/s — a 30-50x gap. Decode is memory-bound so the gap is decisive. In 2026 the landscape splits four ways. Apple's Neural Engine peaks at 38 TOPS on M4 (35 TOPS on A18) with unified memory (no CPU↔NPU copy). Qualcomm's Snapdragon X Elite Hexagon NPU hits 45 TOPS. WebGPU + WebLLM runs Llama 3.1 8B (Q4) at ~41 tok/s on M3 Max (roughly 70-80% of native); ~19k GitHub stars, OpenAI-compatible API, ~70-75% mobile coverage. NVIDIA Jetson Orin Nano Super (8GB) fits Llama 3.2 3B / Phi-3; AGX Orin runs gpt-oss-20b via vLLM at ~40 tok/s; Jetson T4000 (JetPack 7.1) is 2x AGX Orin. TensorRT Edge-LLM supports EAGLE-3, NVFP4, chunked prefill — shown at CES 2026 by Bosch, ThunderSoft, MediaTek.

**Prerequisites:** [Serving models](#/study/ai/ai-inference-serving), [Quantization: Making Models Fit](#/study/ai/scratch-10-11-quantization)

## Learning Objectives

- Explain why mobile LLM inference is memory-bandwidth-bound and compute is secondary.
- Enumerate the four edge targets (Apple ANE, Qualcomm Hexagon, WebGPU/WebLLM, NVIDIA Jetson) and match each to a use case.
- Name the 2026 WebGPU coverage gap (Firefox Android catching up) and the Safari iOS 26 landing.
- Pick a quantization format per target (Core ML INT4 + FP16 for ANE, QNN INT8/INT4 for Hexagon, WebGPU Q4 for browser, NVFP4 for Jetson Thor).

## The Problem

A customer wants an on-device chatbot: voice-first, private-by-default, works offline. On a MacBook Pro M3 Max, Llama 3.1 8B Q4 runs at ~55 tok/s — fine. On an iPhone 16 Pro, the same model runs at 3 tok/s — not fine. On a mid-range Android with Snapdragon 8 Gen 3, 7 tok/s. In the browser via WebGPU on Chrome Android v121+, 4-8 tok/s depending on the device.

The throughput variance is not a porting issue. It is the bandwidth gap times the quantization format times whether the NPU is accessible from user-space. Edge inference in 2026 is four different problems with four different solutions.

## The Concept

### Bandwidth is the real ceiling

Decode reads the full set of weights for every token. One 7B model in Q4 is 3.5 GB. Reading 3.5 GB at 50 GB/s takes 70 ms — a theoretical ceiling of ~14 tok/s. At 90 GB/s (high-end mobile DRAM) the ceiling moves to ~25 tok/s. No amount of compute helps below this number.

Datacenter HBM3 at 3 TB/s clears the same 3.5 GB in 1.2 ms — ceiling is 830 tok/s. Same model, same weights. Different memory subsystem.

### Apple Neural Engine (M4 / A18)

- Up to 38 TOPS on M4; Apple quotes 35 TOPS for A18. Unified memory (CPU and ANE share the same pool) — no copy overhead.
- Access via Core ML models (`.mlpackage`, compiled to `.mlmodelc`), or via Metal Performance Shaders (MPS) through PyTorch.
- llama.cpp's Metal backend runs its own Metal GPU kernels (not MPS, not the ANE); native ANE requires Core ML conversion.
- Best practical path for iOS apps in 2026: Core ML with INT4 weights + FP16 activations.

### Qualcomm Hexagon (Snapdragon X Elite / 8 Gen 4)

- Up to 45 TOPS on Snapdragon X Elite (the phone part shipped as Snapdragon 8 Elite, not "8 Gen 4"). Integrated with CPU and GPU in the SoC but separate memory domain.
- QNN (Qualcomm Neural Network) SDK and AI Hub provide conversion from PyTorch/ONNX.
- Chat templates, Llama 3.2, Phi-3 all ship as first-class artifacts on AI Hub.

### Intel / AMD NPUs (Lunar Lake, Ryzen AI 300)

- 40-50 TOPS. Software lags behind Apple/Qualcomm; OpenVINO is improving but niche.
- Best for Copilot+ apps on x86 Windows laptops; native on AMD/Intel desktops for local-first.

### WebGPU + WebLLM

- Run models in the browser via WebGPU compute shaders; no install.
- Llama 3.1 8B Q4 at ~41 tok/s on M3 Max — roughly 70-80% of native via same backend.
- ~19k GitHub stars on WebLLM; OpenAI-compatible JS API; Apache 2.0.
- 2026 coverage: Chrome Android v121+, Safari iOS 26 GA, Firefox Android still catching up. Overall ~70-75% mobile coverage.

### NVIDIA Jetson family

- Orin Nano Super (8GB): fits Llama 3.2 3B, Phi-3 at good tok/s.
- AGX Orin: runs gpt-oss-20b via vLLM at ~40 tok/s.
- T4000 (JetPack 7.1): up to 2x AGX Orin performance; AGX Thor (T5000): up to 7.5x AGX Orin AI compute. EAGLE-3 and NVFP4 supported.
- TensorRT Edge-LLM (2026) supports EAGLE-3 speculative decoding, NVFP4 weights, chunked prefill — the datacenter optimizations ported to edge.

### Quantization choice per target

| Target | Format | Notes |
|--------|--------|-------|
| Apple ANE | INT4 weights + FP16 activations | Core ML conversion path |
| Qualcomm Hexagon | QNN INT8 / INT4 | AI Hub converters |
| WebGPU / WebLLM | Q4 MLC (q4f16_1) | Use `mlc_llm convert_weight` + compiled `.wasm`; GGUF is not supported |
| Jetson Orin Nano | Q4 GGUF or TRT-LLM INT4 | Memory-bound |
| Jetson AGX / Thor | NVFP4 + FP8 KV | Edge-LLM path |

### The long-context trap on edge

Llama 3.1's 128K context is a datacenter feature. On a phone with 8 GB RAM, 4 GB model + ~4 GB FP16 KV cache for 32K tokens (Llama 3.1 8B) + OS overhead = OOM. Edge deployments keep context at 4K-8K unless aggressive KV quantization (Q4 KV) is accepted.

### Voice is the killer app

Voice agents are latency-sensitive (first token < 500 ms). Local inference eliminates network latency entirely. Combine with speech-to-text (Whisper Turbo variants run on edge) and edge inference becomes the production-quality voice loop.

### Numbers you should remember

- Apple ANE: 38 TOPS (M4), 35 TOPS (A18).
- Qualcomm Hexagon SD X Elite: 45 TOPS.
- WebLLM M3 Max: ~41 tok/s on Llama 3.1 8B Q4.
- AGX Orin: ~40 tok/s on gpt-oss-20b via vLLM.
- Datacenter-edge bandwidth gap: 30-50x.
- WebGPU mobile coverage: ~70-75% (Firefox Android lagging).

## Use It

`code/main.py` computes theoretical decode throughput ceilings from bandwidth-bound math across edge targets. Compares to observed benchmarks and highlights where bandwidth, not compute, is the bottleneck.

## Ship It

This lesson produces `outputs/skill-edge-target-picker.md`. Given platform (iOS/Android/browser/Jetson), model, and latency/memory budget, picks a quantization format and conversion pipeline.

Source: [AI Engineering from Scratch, phase 17, 12-edge-inference](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/17-infrastructure-and-production/12-edge-inference), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What is the core constraint that makes mobile LLM inference slower than datacenter, per the lesson?
A: Memory bandwidth (mobile DRAM at 50-90 GB/s vs HBM3 at 2-3 TB/s).
Q: Why does Apple's Neural Engine avoid CPU-NPU copy overhead?
A: Apple Silicon ships unified memory — CPU and ANE share the same pool.
Q: Which quantization format does the lesson recommend for WebGPU + WebLLM in the browser?
A: Q4 MLC (q4f16_1) compiled via mlc_llm convert_weight.
Q: Roughly what WebGPU mobile coverage does the lesson report for 2026?
A: About 70-75%, with Firefox Android still catching up.
Q: Why is keeping 128K context impractical on a typical phone?
A: Model weights plus KV cache for 32K tokens plus OS overhead easily exceed the 8 GB RAM budget.
Q: Why is voice highlighted as the killer app for edge inference?
A: Voice agents are latency-sensitive (first token < 500 ms) and local inference eliminates network latency entirely.
```

===DEEPER===
## Exercises

1. Run `code/main.py`. For a 7B model in Q4 on a Snapdragon 8 Gen 3 (~77 GB/s bandwidth), compute the decode ceiling. Compare to observed 6-8 tok/s — is the runtime efficient?
2. WebGPU on Android requires Chrome v121+. Design a fallback for older browsers — server-side via the same OpenAI-compatible API.
3. Your iOS app needs 4K-context streaming. Which model/format combination lets you stay under 4 GB active memory on an iPhone 16?
4. Jetson AGX Orin runs gpt-oss-20b at 40 tok/s. Jetson Nano fits only a 3B. If your product targets both, how do you unify the inference stack?
5. Argue whether "WebLLM is production-ready in 2026." Cite the coverage, performance, and the Firefox Android gap.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|------------------------|
| ANE | "Apple neural engine" | On-device NPU in M-series and A-series; unified memory |
| Hexagon | "Qualcomm NPU" | Snapdragon NPU; QNN SDK for access |
| WebGPU | "browser GPU" | W3C-standardized browser GPU API; Chrome/Safari 2026 |
| WebLLM | "browser LLM runtime" | MLC-LLM project; Apache 2.0; OpenAI-compatible JS |
| Jetson | "NVIDIA edge" | Orin Nano / AGX / Thor / T4000 family |
| TRT Edge-LLM | "edge TensorRT" | NVIDIA's open-source C++ LLM/VLM runtime for Jetson/DRIVE Thor (JetPack 7.1, 2026), separate from TRT-LLM; EAGLE-3 + NVFP4 |
| Unified memory | "shared pool" | CPU and NPU see same RAM; no copy overhead |
| Bandwidth-bound | "memory limited" | Decode gated by bytes/sec reading weights |
| Core ML | "Apple conversion" | Apple framework for ANE-native models |
| QNN | "Qualcomm stack" | Qualcomm Neural Network SDK |

## Further Reading

- [On-Device LLMs State of the Union 2026](https://v-chandra.github.io/on-device-llms/) — landscape and benchmarks.
- [NVIDIA Jetson Edge AI](https://developer.nvidia.com/blog/getting-started-with-edge-ai-on-nvidia-jetson-llms-vlms-and-foundation-models-for-robotics/) — Orin / AGX / Thor.
- [NVIDIA TensorRT Edge-LLM](https://developer.nvidia.com/blog/accelerating-llm-and-vlm-inference-for-automotive-and-robotics-with-nvidia-tensorrt-edge-llm/) — 2026 edge port announcement.
- [WebLLM (arXiv:2412.15803)](https://arxiv.org/html/2412.15803v2) — design and benchmarks.
- [Apple Core ML](https://developer.apple.com/documentation/coreml) — ANE-native conversion.
- [Qualcomm AI Hub](https://aihub.qualcomm.com/) — pre-converted models for Hexagon.
