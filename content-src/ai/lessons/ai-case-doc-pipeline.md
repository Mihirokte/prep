---
id: ai-case-doc-pipeline
chapter: ai-design
title: Design document extraction at scale
minutes: 9
---
Extracting structured data from documents at scale (invoices, contracts, forms) is a design question that rewards engineering judgment over model cleverness. The hard parts are not the prompt: they are batch versus online processing, enforcing a schema, scoring confidence, and routing low-confidence results to a human review queue. The interviewer wants a pipeline that is cheap, correct where it is confident, and safe where it is not.

## Clarify first

- Volume and latency: millions of docs overnight, or a few per second interactively?
- Document variety: a fixed template, or arbitrary layouts and languages?
- Schema: what fields, which are required, what types and constraints?
- Error tolerance: what is the cost of a wrong field versus a missed one?
- Review capacity: how many documents can humans check per day?

These set the batch-versus-online choice and the confidence threshold for review.

## Batch versus online

| Mode | When | Lever |
|---|---|---|
| Batch | Large backlogs, no human waiting | Batch API at reduced cost, high throughput |
| Online | Per-document, user is waiting | Low latency, stream status |

Most extraction-at-scale work is batch: documents arrive in bulk and nobody is blocked on a single one, so you use an asynchronous batch API at a discount and optimize for throughput. Reserve online processing for the interactive cases where a user uploads one document and waits.

## Architecture

```flow
dir: LR
doc: Document | actor
prep: Parse and OCR | step
llm: Extract to schema | model
val: Validate schema | gate
conf: Confidence check | gate
store: Store record | store
review: Review queue | actor
doc -> prep : raw file
prep -> llm : text plus layout
llm -> val : candidate fields
val -> conf : typed record
conf -> store : high confidence
conf --> review : low confidence
review -> store : corrected
```

Parse and OCR turn the file into text (and layout, which matters for forms). The model extracts fields into a schema. A validator enforces types and required fields. A confidence gate decides: store directly, or send to a human review queue. Corrected records flow back to storage and, ideally, into the eval set.

## Structured outputs and validation

The extraction must emit a typed record, not prose, so use schema-constrained decoding (or JSON mode) and validate every result against the schema.

```steps
Constrain | Decode against the field schema so the output is parseable
Validate | Check required fields, types, enums, and value ranges
Repair | On a validation failure, retry once with the error fed back
Confidence | Score each field and the record for the review decision
Route | Store high-confidence records, queue low-confidence for review
```

Validation catches the structural failures (missing field, wrong type, enum drift, truncation). It does not catch a well-formed but wrong value, which is what the confidence score and the review queue are for.

## The confidence and review queue

The review queue is the safety mechanism that lets you automate most volume without accepting silent errors.

> **Key idea.** You do not need the model to be right every time, only to know when it is unsure. A good confidence signal plus a human queue converts an imperfect extractor into a reliable pipeline.

Set the threshold from the error tolerance and the review capacity: a lower threshold sends more to humans (safer, more expensive), a higher one automates more (cheaper, riskier). Track the queue rate as an operating metric and the review correction rate as a quality signal, since a rising correction rate on auto-accepted records means the threshold is too loose.

## Evals and cost

- Field-level accuracy on a labelled set, sliced by field and document type, because an aggregate hides a field that is systematically wrong.
- Precision and recall per field: a missed field and a wrong field often have different costs.
- Auto-accept rate and review correction rate as the operating pair.

Cost is dominated by input tokens (document length) times volume; batch pricing and tight prompts matter most. Human review is a real cost line, so the confidence threshold is a cost-versus-risk dial, not just a quality knob.

> **Interview.** Choose batch for bulk (asynchronous, discounted), make the output schema-constrained and validated with a repair retry, add a confidence score feeding a human review queue, and set the threshold from error tolerance against review capacity. Slice field accuracy, and treat review as a designed path, not a failure.

```recall
Q: Why is batch processing usually right for extraction at scale?
A: Documents arrive in bulk and no human is waiting on a single one, so an asynchronous batch API at a discount and optimized for throughput fits, rather than paying for low latency nobody needs.
Q: What does schema validation catch, and what does it miss?
A: It catches structural failures (missing or wrong-typed fields, enum drift, truncation). It misses a well-formed but factually wrong value, which is why you also need a confidence score and a human review queue.
Q: How do you set the confidence threshold for the review queue?
A: From the error tolerance and the review capacity. Lower threshold routes more to humans (safer, costlier), higher automates more (cheaper, riskier). Track auto-accept rate and review correction rate to tune it.
Q: Why slice field-level accuracy instead of reporting one number?
A: An aggregate accuracy can hide a single field that is systematically extracted wrong. Slicing by field and document type surfaces the weak spots that an overall score masks.
Q: What is the repair step and when does it fire?
A: On a schema-validation failure, retry the extraction once with the validation error fed back to the model, so it can fix a malformed output before the record goes to the confidence gate.
```

===DEEPER===

## Confidence signals for extraction

Extraction confidence can come from several sources, best combined. Token-level logprobs over the extracted span give a rough per-field confidence, usable but poorly calibrated alone. Self-consistency, running extraction two or three times (or at a low temperature) and checking agreement, flags unstable fields: disagreement is a strong uncertainty signal. Cross-field validation uses domain constraints (line items summing to a total, a date within a plausible range, a tax rate matching a jurisdiction) to catch values that are individually plausible but mutually inconsistent. Source grounding checks that an extracted value actually appears in the document text, catching invented fields. Combine these into a per-field score and a record-level score, calibrate against a labelled set, and route to review on the record score so one shaky field pulls the whole document to a human.

## Why layout and OCR dominate quality

For scanned forms and invoices, the ceiling on extraction accuracy is usually set before the model sees anything, by OCR and layout parsing. A number misread by OCR is wrong no matter how good the extractor, and a model given a flat text dump of a two-column form loses the spatial relationships that disambiguate which label a value belongs to. Preserve layout: pass bounding boxes or a structured representation, keep table structure, and feed the model positional context. Measure OCR quality separately from extraction quality, because conflating them hides the real bottleneck. For high-stakes fields, a hybrid of deterministic parsing (regex or template matching where the layout is fixed) and model extraction (for the variable parts) often beats model-only.

## Operating the queue over time

The review queue is a feedback loop, not just a safety net. Every human correction is a labelled example: feed it back into the eval set so the golden set tracks real production errors, and use accumulated corrections to decide whether to fine-tune a smaller model (see the fine-tune-or-prompt lesson) once volume and a stable schema justify it. Monitor the auto-accept rate and the correction rate on audited auto-accepted records together: if correction rate on audits rises, the threshold has drifted loose relative to a changing document distribution, and you tighten it. Watch for distribution shift, a new vendor's invoice format or a new document type, which shows up as a spike in queue rate for a slice, and handle it with new eval examples rather than loosening the threshold to clear the backlog.
