---
id: ai-mcp
chapter: ai-patterns
title: Model Context Protocol (MCP)
minutes: 4
---
MCP is an open standard introduced by Anthropic in Nov 2024 for connecting AI applications to external tools, data, and workflows through one client-server protocol — described as "a USB-C port for AI applications."

The distinction that gets tested: **tool use is the *mechanism*** (the model emits a structured call, you execute it). **MCP standardises the *transport and discovery* layer** — instead of writing a bespoke integration per tool per app, a server exposes its tools/resources/prompts once, and any MCP-compatible client (Claude, ChatGPT, VS Code, Cursor, and others) can connect to it.

So the payoff is **combinatorial**: it grows with N clients × M tools, not with either alone. For a true 1:1 integration — one agent, one internal API — the protocol overhead may not pay for itself yet; the counter-argument is optionality for future clients.

Fast-moving governance note: on Dec 9, 2025 Anthropic donated MCP to an Agentic AI Foundation under the Linux Foundation (the same track as Kubernetes and PyTorch), with OpenAI, AWS, Google, Microsoft, and others as members. The governance transfer is well-corroborated; specific adoption *percentages* vary wildly by source, so don't quote one as settled — say "adoption is real and accelerating, governance moved to the Linux Foundation in Dec 2025, but survey numbers vary by methodology."
