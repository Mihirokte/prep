---
id: ai-guardrails
chapter: ai-production
title: Guardrails and safety
minutes: 4
---
Guardrails come in layers, and the interview-relevant insight is architectural, not a list of products.

- **Provider moderation** (OpenAI's Moderation API, Anthropic's classifiers) is the baseline layer for clearly disallowed content — not a substitute for application-specific checks.
- **Approval gates** for high-stakes actions, grounded in irreversibility and blast radius (see the human-in-the-loop lesson).
- **Open-source libraries** (Guardrails AI, NVIDIA NeMo Guardrails) for input/output validation, PII redaction, jailbreak detection. (Fast-moving — confirm current maturity before quoting specifics.)

The one primary-sourced architectural recommendation worth stating precisely: **a separate, dedicated model call that screens a response tends to outperform having the same call both generate *and* self-check.** This is Anthropic's parallelization/sectioning pattern applied to safety — one model answers, another independent call screens it.

So for a coding agent with shell access, the concrete guardrails are: sandboxing, command allow/deny lists, approval gates on destructive commands, and a *separate* screening call over the output — not asking the generating call to also police itself.
