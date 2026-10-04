---
id: ai-frameworks
chapter: ai-stack
title: Frameworks: the honest LangChain take
minutes: 5
---
LangChain is the original, broadest LLM orchestration framework; LangGraph is its graph-based agent layer for more explicit control flow. The interview-worthy answer holds two true things at once rather than picking a side.

**The primary-sourced caution against frameworks generally** — Anthropic's own "Building effective agents": *"many patterns can be implemented in a few lines of code... [frameworks] often create extra layers of abstraction that can obscure the underlying prompts and responses, making them harder to debug... If you do use a framework, ensure you understand the underlying code."* Their top recommendation is to **start with direct API calls.**

**Practitioner sentiment on LangChain, 2025–2026** (secondary, but genuinely convergent across independent authors): recurring "it's just a wrapper" complaints, dependency bloat, frequent breaking API changes, and abstraction that slows debugging. One representative framing: the question "should I use LangChain" went from "obvious yes" to "it depends, and most of the time, no."

**Where it still gets recommended:** teams already in the ecosystem (LangSmith tracing pairs natively), and genuinely complex explicit-graph control flow where LangGraph's primitives save real work.

The strong answer to "should this team use LangChain": for a 3-person startup prototyping with no existing investment, probably not — start with direct API calls. For a 40-engineer platform team standardising across a dozen teams, the case for a shared framework (consistency, tracing, onboarding) is real. Hold both, don't treat it as binary. Alternatives to know: direct SDKs, Pydantic AI / Instructor / DSPy (focused libraries), CrewAI / AutoGen / OpenAI Agents SDK / Claude Agent SDK (multi-agent oriented) — all fast-moving; read their own docs, not comparison blogs.
