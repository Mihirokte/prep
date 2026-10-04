---
id: ai-guardrails
chapter: ai-production
title: Guardrails and safety layers
minutes: 8
---
A guardrail is a check that sits outside the model and constrains what goes in, what comes out, or what the system is allowed to do. The interview-relevant insight is architectural, not a product list: guardrails are layers at the system edges, and the strongest ones never trust the generating model to police itself. An engineer who answers add a safety prompt has missed the point; one who talks about input, output, and action layers with a separate screening call has it.

## Three layers

Guardrails sit at three points, and a serious system has all three.

- **Input guardrails** screen what reaches the model: prompt-injection and jailbreak detection, PII redaction before logging, topic and policy filters, length and format limits.
- **Output guardrails** screen what the model produced before it reaches the user: toxicity and policy checks, PII leak detection, schema and groundedness validation, refusal of disallowed content.
- **Action guardrails** screen what the system is allowed to do with the output: approval gates on high-stakes actions, command allow and deny lists, permission and least-privilege checks on tools.

```flow
dir: LR
user: User input | actor
ig: Input guard | gate
llm: LLM | model
og: Output guard | gate
ag: Action guard | gate
tool: Tool or effect | tool
out: Response | step
user -> ig : raw input
ig -> llm : cleaned input
llm -> og : draft output
og -> ag : proposed action
ag -> tool : approved action
og -> out : safe response
```

## Rule vs classifier vs LLM check

Each layer can be enforced three ways, trading latency, cost, and flexibility.

| Mechanism | Latency | Catches | Weakness |
|---|---|---|---|
| Rule or regex | lowest | known exact patterns, formats, allow and deny lists | brittle, misses paraphrase |
| Classifier | low | learned categories like toxicity or jailbreak | needs training data, fixed classes |
| LLM check | high | nuanced, context-dependent policy | slow, costly, itself fallible |

The decision rule: use the cheapest mechanism that catches the risk. A deny list for rm -rf is a rule, not a model. Toxicity is a classifier. Is this medical advice that needs a disclaimer is an LLM check. Reaching for an LLM check where a rule suffices adds latency and a new failure mode for nothing.

## The separate-call principle

The one primary-sourced architectural recommendation worth stating precisely: a separate, dedicated model call that screens a response tends to outperform having the same call both generate and self-check. This is Anthropic's parallelization and sectioning pattern applied to safety, one model answers, an independent call screens it. The generating call is biased toward defending its own output and is the exact call an injection may already have compromised, so asking it to also police itself is asking the fox to audit the henhouse.

> **Interview.** Do not say add a line to the prompt telling it to refuse unsafe requests. Say run the output through a separate screening call, because the generating call can be injected or biased toward its own answer and cannot be trusted to check itself.

## Latency and false positives

Guardrails are not free, and the trade-off is the real engineering content. Every check adds latency, and an LLM-based check can add as much as the generation itself, so an output guard that doubles response time may not be worth it for a low-risk feature. False positives are the other cost: a guard tuned too tight blocks legitimate requests and trains users to route around it, while one tuned too loose misses real harm. Tune the threshold to the stakes, and run cheap rule and classifier checks inline while reserving expensive LLM checks for high-risk paths or running them asynchronously where a slight delay in flagging is acceptable.

## Worked case: a code-executing agent

An agent with shell access is the canonical high-stakes case, and the guardrails are concrete, not a safety prompt.

```steps
Sandbox | Run every command in an isolated container with no network and no host mounts
Allow list | Permit only an explicit set of commands and flags, deny everything else by default
Approval gate | Require human approval for destructive or irreversible actions
Resource caps | Bound CPU, memory, wall-clock, and output size so a bad command cannot run away
Output screen | Run a separate call over the result before it re-enters the agent context
```

The ordering reflects least privilege: contain the blast radius first with the sandbox, then narrow what is even attemptable with the allow list, then put a human on the few irreversible actions. A generating call that also decided its own commands were safe would be the single point an injection needs to compromise, which is why the approval gate and the output screen are separate from it.

```recall
Q: Why is a separate screening call better than telling the generating model to self-check?
A: The generating call is biased toward defending its own output and may already be compromised by an injection, so it cannot be trusted to police itself. An independent call has no such bias.
Q: You need to block the command rm -rf. Rule, classifier, or LLM check, and why?
A: A rule or deny list. The pattern is exact and known, so a regex catches it at the lowest latency with no model failure mode, where a classifier or LLM check would add cost and new errors for nothing.
Q: What are the three guardrail layers and what does each constrain?
A: Input guards constrain what reaches the model, output guards constrain what the model's response contains before the user sees it, and action guards constrain what the system is allowed to do with the output.
Q: Why can over-tight guardrails be as harmful as loose ones?
A: Too-tight guards block legitimate requests and train users to route around them, defeating the control, while too-loose guards miss real harm. The threshold must be tuned to the stakes.
Q: For a code-executing agent, why sandbox first rather than rely on an allow list alone?
A: The sandbox contains the blast radius so even a command that slips past the allow list cannot reach the host or network. Layers compound, the allow list narrows what is attempted, the sandbox bounds what any attempt can do.
```

===DEEPER===

### Guardrails are defense in depth, not a single wall

No single guardrail is reliable, which is why they are layered. An input filter will miss a cleverly paraphrased jailbreak, an output classifier will have false negatives, an allow list can be socially engineered into including something it should not. The security comes from stacking independent checks so that an attack must defeat all of them, and from putting the irreversible actions behind a human. This is the same logic as the lethal-trifecta framing in the prompt-injection lesson: you reduce risk by removing capabilities and by inserting independent gates, not by trusting one perfect filter. State this explicitly in an interview, because single-wall thinking, one strong filter will stop everything, is the mistake the layering question is designed to catch.

### Provider moderation as a baseline, not a substitute

Provider moderation endpoints and classifiers are a cheap baseline layer for clearly disallowed content and should usually be on, but they are tuned for general policy, not your application's specific risks. A medical app needs a disclaimer check a general moderator has no notion of; a financial app needs a no-advice guard; a coding agent needs command gating no content moderator covers. Treat provider moderation as the floor and build application-specific guards on top. Open-source libraries exist for input and output validation, PII redaction, and jailbreak detection, and the space moves fast, so confirm current maturity before quoting a specific tool's capabilities (as of 2026, re-check).

### Where to spend the latency budget

Because an LLM-based guard can cost as much as generation, place checks by risk and by reversibility. Inline, synchronous checks belong on the path to an irreversible or high-stakes action, a destructive command, an outbound payment, a message to a customer, where blocking before the effect is the whole point. Asynchronous or sampled checks suit low-stakes, reversible outputs where catching a problem slightly late is acceptable and the latency of an inline LLM check would not be. The design question is not do we guard this but what does this action cost if it is wrong, and that answer sets both whether the guard is inline and how expensive a mechanism it justifies.

### Guardrails need their own evals

A guardrail is a classifier, and like any classifier it has a precision and recall you must measure, not assume. Build a labelled set of safe and unsafe cases, including adversarial paraphrases, and track the guard's false-positive and false-negative rates the same way you track the system's quality evals. A guard you never evaluated is a guard whose failure rate you do not know, which in a safety context is the worst kind of blind spot. Fold guard failures back into the set the same way you harvest quality regressions, so the guard improves against real attempts rather than against your imagination of them.
