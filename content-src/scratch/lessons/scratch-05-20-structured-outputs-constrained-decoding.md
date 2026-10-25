---
id: scratch-05-20-structured-outputs-constrained-decoding
chapter: scratch-05-nlp-foundations-to-advanced
title: Structured Outputs & Constrained Decoding
minutes: 0
---
> Ask an LLM for JSON. Get JSON most of the time. In production, "most" is the problem. Constrained decoding turns "most" into "always" by editing the logits before sampling.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 5 · 17 (Chatbots), Phase 5 · 19 (Subword Tokenization)
**Time:** ~60 minutes

## The Problem

A classifier prompts an LLM: "Return one of {positive, negative, neutral}." The model returns "The sentiment is positive — this review is overwhelmingly favorable because the customer explicitly states that they ...". Your parser crashes. Your classifier's F1 is 0.0.

Free-form generation is not a contract. It is a suggestion. A production system needs a contract.

Three layers exist in 2026.

1. **Prompting.** Ask nicely. "Return only the JSON object." Works ~80% on frontier models, less on smaller ones.
2. **Native structured output APIs.** OpenAI `response_format`, Anthropic tool use, Gemini JSON mode. Reliable on supported schemas. Vendor-locked.
3. **Constrained decoding.** Modify the logits at every generation step so the model *cannot* emit invalid tokens. 100% valid by construction. Works on any local model.

This lesson builds intuition for all three and names when to reach for which.

## The Concept

**How constrained decoding works.** At each generation step, the LLM produces a logit vector over the full vocabulary (~100k tokens). A *logit processor* sits between the model and the sampler. It computes which tokens are valid given the current position in the target grammar — JSON Schema, regex, context-free grammar — and sets the logits of all invalid tokens to negative infinity. The softmax over the remaining logits puts probability mass only on valid continuations.

Implementations in 2026:

- **Outlines.** Compiles JSON Schema or regex into a finite-state machine. Every token gets an $O(1)$ valid-next-token lookup. FSM-based, so recursive schemas need flattening.
- **XGrammar / llguidance.** Context-free grammar engines. Handle recursive JSON Schema. Near-zero decoding overhead. OpenAI credited llguidance in their 2025 structured output implementation.
- **vLLM guided decoding.** Built-in `guided_json`, `guided_regex`, `guided_choice`, `guided_grammar` via Outlines, XGrammar, or lm-format-enforcer backends.
- **Instructor.** Pydantic-based wrapper over any LLM. Retries on validation failure. Cross-provider, but does not modify logits — it relies on retries + structured-output-aware prompts.

### The counterintuitive result

Constrained decoding is often *faster* than unconstrained generation. Two reasons. First, it shrinks the next-token search space. Second, clever implementations skip token generation entirely for forced tokens (scaffolding like `{"name": "` — every byte is determined).

### The pitfall that costs you

Field order matters. Put `answer` before `reasoning`, and the model commits to an answer before it thinks. JSON is valid. Answer is wrong. No validation catches it.
```json
// BAD
{"answer": "yes", "reasoning": "because ..."}

// GOOD
{"reasoning": "... therefore ...", "answer": "yes"}
```
Schema field order is logic, not formatting.

## Build It

### Step 1: regex-constrained generation from scratch

See `code/main.py` for a standalone FSM implementation. The core idea in 30 lines:
```python
def mask_logits(logits, valid_token_ids):
    mask = [float("-inf")] * len(logits)
    for tid in valid_token_ids:
        mask[tid] = logits[tid]
    return mask

def generate_constrained(model, tokenizer, prompt, fsm):
    ids = tokenizer.encode(prompt)
    state = fsm.initial_state
    while not fsm.is_accept(state):
        logits = model.next_token_logits(ids)
        valid = fsm.valid_tokens(state, tokenizer)
        logits = mask_logits(logits, valid)
        tok = sample(logits)
        ids.append(tok)
        state = fsm.transition(state, tok)
    return tokenizer.decode(ids)
```
The FSM tracks what parts of the grammar we have satisfied so far. `valid_tokens(state, tokenizer)` computes which vocabulary tokens can advance the FSM without leaving an accepting path.

### Step 2: Outlines for JSON Schema
```python
from pydantic import BaseModel
from typing import Literal
import outlines

class Review(BaseModel):
    sentiment: Literal["positive", "negative", "neutral"]
    confidence: float
    evidence_span: str

model = outlines.models.transformers("meta-llama/Llama-3.2-3B-Instruct")
generator = outlines.generate.json(model, Review)

result = generator("Classify: 'The wait staff was attentive and the food arrived hot.'")
print(result)
# Review(sentiment='positive', confidence=0.93, evidence_span='attentive ... hot')
```
Zero validation errors. Ever. The FSM makes invalid output unreachable.

### Step 3: Instructor for provider-agnostic Pydantic
```python
import instructor
from anthropic import Anthropic
from pydantic import BaseModel, Field

class Invoice(BaseModel):
    vendor: str
    total_usd: float = Field(ge=0)
    line_items: list[str]

client = instructor.from_anthropic(Anthropic())
invoice = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    response_model=Invoice,
    messages=[{"role": "user", "content": "Extract from: 'Acme Corp $420. Widget, Gizmo.'"}],
)
```
Different mechanism. Instructor does not touch logits. It formats the schema into the prompt, parses the output, and retries on validation failure (default 3 times). Works with any provider. Retries add latency and cost. Cross-provider portability is the selling point.

### Step 4: native vendor APIs
```python
from openai import OpenAI

client = OpenAI()
response = client.responses.create(
    model="gpt-5",
    input=[{"role": "user", "content": "Classify: 'The food was cold.'"}],
    text={"format": {"type": "json_schema", "name": "sentiment",
          "schema": {"type": "object", "required": ["sentiment"],
                     "properties": {"sentiment": {"type": "string",
                                                  "enum": ["positive", "negative", "neutral"]}}}}},
)
print(response.output_parsed)
```
Server-side constrained decoding. Reliability parity with Outlines for supported schemas. No local model management. Locks you to the vendor.

## Pitfalls

- **Recursive schemas.** Outlines flattens recursion to a fixed depth. Tree-structured outputs (nested comments, AST) need XGrammar or llguidance (CFG-based).
- **Huge enums.** 10,000-option enum compiles slowly or times out. Switch to a retriever: predict top-k candidates first, constrain to those.
- **Grammar too strict.** Force `date: "YYYY-MM-DD"` regex and the model cannot output `"unknown"` for missing dates. Model compensates by inventing a date. Allow `null` or a sentinel.
- **Premature commitment.** See field-order pitfall above. Always put reasoning first.
- **Vendor JSON mode without schema.** Pure JSON mode only guarantees valid JSON, not valid *for your use case*. Always provide a full schema.

## Use It

The 2026 stack:

| Situation | Pick |
|-----------|------|
| OpenAI/Anthropic/Google model, simple schema | Native vendor structured output |
| Any provider, Pydantic workflow, can tolerate retries | Instructor |
| Local model, need 100% validity, flat schema | Outlines (FSM) |
| Local model, recursive schema | XGrammar or llguidance |
| Self-hosted inference server | vLLM guided decoding |
| Batch processing with retries acceptable | Instructor + cheapest model |

## Ship It

Save as `outputs/skill-structured-output-picker.md`:
```markdown
---
name: structured-output-picker
description: Choose a structured output approach, schema design, and validation plan.
version: 1.0.0
phase: 5
lesson: 20
tags: [nlp, llm, structured-output]
---

Given a use case (provider, latency budget, schema complexity, failure tolerance), output:

1. Mechanism. Native vendor structured output, Instructor retries, Outlines FSM, or XGrammar CFG. One-sentence reason.
2. Schema design. Field order (reasoning first, answer last), nullable fields for "unknown", enum vs regex, required fields.
3. Failure strategy. Max retries, fallback model, graceful `null` handling, out-of-distribution refusal.
4. Validation plan. Schema compliance rate (target 100%), semantic validity (LLM-judge), field-coverage rate, latency p50/p99.

Refuse any design that puts `answer` or `decision` before reasoning fields. Refuse to use bare JSON mode without a schema. Flag recursive schemas behind an FSM-only library.
```

Source: [AI Engineering from Scratch, phase 5, 20-structured-outputs-constrained-decoding](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/05-nlp-foundations-to-advanced/20-structured-outputs-constrained-decoding), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why is prompt-only 'return JSON' not enough for production?
A: Frontier models comply most of the time but not always; the small fraction of malformed outputs breaks downstream parsers. Prompt-only structure works ~80% of the time on frontier models; production needs harder guarantees.
Q: What does constrained decoding modify at each generation step?
A: The logit vector, masking tokens that would invalidate the target grammar so only valid continuations can be sampled. A logit processor sets invalid tokens to -inf so the softmax cannot sample them.
Q: Why might constrained decoding be faster than free generation?
A: Forced scaffold tokens (e.g. '{"name": "') can be emitted directly without sampling, and the valid-token search space shrinks. Determined tokens skip sampling and reduced valid-token sets shrink the decode cost.
Q: Which schema design choice prevents premature commitment by the model?
A: Place reasoning fields before the answer/decision field so the model thinks before committing. Field order is logic: putting reasoning first lets the model think before locking in an answer.
Q: What is the limitation of FSM-based constrained decoding tools like Outlines?
A: Recursive schemas have to be flattened; truly recursive structures need CFG-based engines such as XGrammar. FSMs cannot represent unbounded recursion; CFG engines handle it.
Q: Why is Instructor described as not modifying logits?
A: Instructor formats the schema into the prompt and parses/retries the output; logit masking happens server-side or not at all. Instructor uses provider-side structured output plus client-side validation and retries, not logit masking.
Q: What problem can a strict regex like date='YYYY-MM-DD' introduce?
A: It removes any escape hatch for unknown values, so the model fabricates a date instead of returning null/sentinel. Over-strict grammars force the model to invent values; always allow null/sentinel for unknowns.
Q: When should you reach for vLLM guided decoding vs a vendor structured-output API?
A: Self-hosted inference where you control the model and want logit-level guarantees without retries. vLLM guided decoding fits self-hosted serving with logit-level constraints; vendor APIs lock you to their stack.
```

===DEEPER===
## Exercises

1. **Easy.** Prompt a small open-weights model (e.g., Llama-3.2-3B) without constrained decoding for `Review(sentiment, confidence, evidence_span)`. Measure the fraction that parse as valid JSON on 100 reviews.
2. **Medium.** Same corpus with Outlines JSON mode. Compare compliance rate, latency, and semantic accuracy.
3. **Hard.** Implement a regex-constrained decoder from scratch for phone numbers (`\d{3}-\d{3}-\d{4}`). Verify 0 invalid outputs on 1000 samples.

## Key Terms

| Term | What people say | What it actually means |
|------|-----------------|-----------------------|
| Constrained decoding | Force valid output | Mask invalid-token logits at every generation step. |
| Logit processor | The thing that constrains | Function: `(logits, state) -> masked_logits`. |
| FSM | Finite-state machine | Compiled grammar representation; $O(1)$ valid-next-token lookup. |
| CFG | Context-free grammar | Grammar that handles recursion; slower but more expressive than FSM. |
| Schema field order | Does it matter? | Yes — first field commits; always put reasoning before answer. |
| Guided decoding | vLLM's name for it | Same concept, integrated into the inference server. |
| JSON mode | OpenAI's early version | Guarantees JSON syntax; does NOT guarantee schema match. |

## Further Reading

- [Willard, Louf (2023). Efficient Guided Generation for LLMs](https://arxiv.org/abs/2307.09702) — the Outlines paper.
- [XGrammar paper (2024)](https://arxiv.org/abs/2411.15100) — fast CFG-based constrained decoding.
- [vLLM — Structured Outputs](https://docs.vllm.ai/en/latest/features/structured_outputs.html) — inference server integration.
- [OpenAI — Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs) — API reference + gotchas.
- [Instructor library](https://python.useinstructor.com/) — Pydantic + retries across providers.
- [JSONSchemaBench (2025)](https://arxiv.org/abs/2501.10868) — benchmarking 6 constrained decoding frameworks.
