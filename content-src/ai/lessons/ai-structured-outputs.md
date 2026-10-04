---
id: ai-structured-outputs
chapter: ai-patterns
title: Structured outputs
minutes: 8
---
Structured output means getting the model to return data in an exact shape your code can consume, usually JSON matching a schema, instead of prose you have to parse. Since 2024 this moved from a prompting trick to a first-class API feature. Interviewers probe it because the interesting problem shifts once the shape is guaranteed: the output can be perfectly well-formed and still wrong.

## Three ways to get structured output

```steps
JSON mode | Ask for JSON and the model returns syntactically valid JSON, but the fields and types are not guaranteed
Schema-constrained decoding | Pass a JSON Schema with strict mode; the shape is enforced at generation, so output always matches
Tool call as schema | Define a tool with a typed input schema; the model emits a call whose arguments match that schema
```

The second and third have converged on the same mechanism: a constrained decoder that only lets the model emit tokens consistent with the schema. "Call this tool with this exact shape" and "return this exact JSON shape" are now the same underlying feature.

OpenAI shipped Structured Outputs in August 2024: set `strict: true` on a `json_schema` response format (or a tool definition) and the output is guaranteed to match the schema, enforced at generation rather than merely requested (OpenAI, Introducing Structured Outputs in the API, 2024). You define the schema in code with Pydantic (Python) or Zod (TypeScript) rather than hand-writing JSON Schema. Strict mode carries constraints: every property must be listed as required and `additionalProperties` must be false, and some JSON Schema keywords are unsupported (vendor docs, as of 2026, re-check). Support is tied to specific model versions, so confirm the model id supports strict mode before relying on it.

## The design question strict mode does not solve

Strict mode guarantees the shape, not the content. The output parses and typechecks, yet a field value can be hallucinated, an amount that was never on the invoice, a category not supported by the text, a date the model inferred. Strict mode removes parse-error handling; it does not validate values.

```flow
dir: LR
model: Model | model
dec: Schema decoder | gate
parse: Parse (always valid) | step
val: Validate values | gate
ok: Accept | store
model -> dec : tokens
dec -> parse : schema-valid JSON
parse -> val : typed object
val -> ok : passes checks
val --> model : fails, repair or re-ask
```

> **Key idea.** Shape conformance and content correctness are different guarantees. Strict mode gives you the first for free and shifts all your effort to the second.

## The validate and repair loop

Even without strict mode, and especially with it, run a validation layer after parsing:

```python
# Sketch: validate values, not just shape
def extract(doc):
    for attempt in range(2):               # bounded retries
        obj = client.generate(doc, schema=Invoice, strict=True)  # shape guaranteed
        errors = validate(obj)             # value checks: ranges, enums, grounding
        if not errors:
            return obj, "ok"
        doc = doc + f"\nFix these problems: {errors}"  # feed errors back
    return obj, "needs_review"             # escalate low-confidence to a human
```

Value checks worth running: numeric ranges and sign, enum membership for categories, date sanity, and grounding (does the extracted amount actually appear in the source text). Low-confidence or repeatedly-failing cases go to a human review queue rather than silently through.

## Failure modes

| Failure | Symptom | Mitigation |
|---|---|---|
| Truncation | Output cut off mid-JSON, invalid even in strict mode | Raise max_tokens, shrink the schema, split the task |
| Enum drift | A category close to but not in your allowed set | Constrain to an enum in the schema, validate membership |
| Hallucinated values | Valid shape, wrong content | Grounding and range checks after parsing |
| Refusals | Model returns a refusal instead of the object | Handle the refusal path explicitly; strict mode may surface a refusal field |
| Over-nesting | Deep or recursive schema the decoder handles poorly | Flatten the schema, prefer shallow objects and arrays |

> **Pitfall.** Trusting strict output as correct because it is well-formed. The schema guarantees it parses, not that it is true. Keep a value-validation layer.

## Schema design tips

- Keep schemas shallow and flat; deep nesting and recursion are harder to generate reliably.
- Use enums for closed sets so the decoder cannot drift.
- Make types specific (integer, not string-that-looks-like-a-number) so the decoder does the coercion.
- Add a confidence or a nullable field for genuinely-unknown values, so the model can say "not present" instead of inventing one.
- Keep field names and descriptions clear; the schema is also a prompt.

```recall
Q: What does strict schema mode guarantee, and what does it not?
A: It guarantees the output matches the schema shape (fields and types), enforced at generation. It does not guarantee the values are correct; content can be hallucinated within a valid shape.
Q: How does strict mode change your error-handling code versus free-form JSON parsing?
A: It removes most parse-error handling (no try/except around json.loads, no missing-key guards). You reallocate that effort to value validation: ranges, enums, grounding, and a review path.
Q: Why add a nullable or "not present" option to an extraction schema?
A: So the model can report a genuinely absent value instead of hallucinating a plausible one to fill a required field.
Q: Name two structured-output failure modes that strict mode does not prevent.
A: Truncation (output cut off, even invalid) and hallucinated values (valid shape, wrong content); also refusals and enum-adjacent drift if not constrained.
```

===DEEPER===

### How constrained decoding works

A constrained decoder restricts the model's token sampling at each step to only those tokens that keep the output a valid prefix of something matching the schema (or grammar). Concretely the schema is compiled to a finite-state machine or grammar, and at each decode step the sampler masks out any token that would violate it. That is why the shape is guaranteed rather than requested: an invalid token is never sampled in the first place. The cost is some compile overhead and the schema constraints vendors impose (all-required properties, no additionalProperties, limited keywords) to keep the grammar tractable. Different providers implement this differently and support different JSON Schema subsets, so treat exact capabilities as fast-moving.

### Why the content problem is the real work

Because the shape is handled, the engineering shifts entirely to value correctness, and that is a grounding and evaluation problem, not a parsing one. For an extraction pipeline this means: cross-check extracted values against the source (the amount should appear on the page; the total should reconcile with line items), constrain categorical fields to enums tied to a known taxonomy, and route low-confidence extractions to a human queue instead of trusting them. Build an eval set of documents with known-correct extractions and measure field-level accuracy, not just "did it return JSON". A pipeline that returns perfectly-shaped, confidently-wrong data is worse than one that returns an error, because the error is visible and the wrong value is not. This connects directly to the RAG and faithfulness lessons: structured output gives you a clean interface, grounding and evaluation make it trustworthy.
