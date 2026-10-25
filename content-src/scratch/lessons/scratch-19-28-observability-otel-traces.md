---
id: scratch-19-28-observability-otel-traces
chapter: scratch-19-capstone-projects
title: Capstone Lesson 28: Observability with OTel GenAI Spans and Prometheus Metrics
minutes: 0
---
> An agent harness without observability is a black box that costs money. This lesson hand-rolls a span builder that emits records compliant with the OpenTelemetry GenAI semantic conventions, writes them to a JSON-Lines file one span per line, and exposes counters and histograms in Prometheus text format. The whole thing is stdlib Python and runs offline.

**Type:** Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 19 · 25 (verification gates), Phase 19 · 26 (sandbox), Phase 19 · 27 (eval harness), Phase 13 · 20 (OpenTelemetry GenAI), Phase 14 · 23 (OTel GenAI conventions)
**Time:** ~90 minutes

## Learning Objectives

- Build a span data class shaped to the OpenTelemetry GenAI semantic conventions.
- Implement a JSONL exporter that writes one self-contained span per line.
- Build counters and histograms with labels and Prometheus text-format exposition.
- Wrap any callable in a span context manager that records duration, status, and exceptions.
- Verify that the emitted spans roundtrip through `json.loads` and match the spec shape.

## The Problem

A coding agent in production produces three classes of artifact every turn: a model call, a tool execution, and a verification gate decision. None of these are useful without structured telemetry.

The first failure mode is the missing trace. Something went wrong on Tuesday but the only record is a 500-line chat log. There is no record of which tool ran, how long it took, how many tokens went into the prompt, or whether the gate refused anything. The agent author has to guess.

The second failure mode is the unparseable trace. The harness wrote spans but used its own ad-hoc field names. Nothing in Grafana, Honeycomb, Jaeger, or the local CLI can read them. Whatever tooling exists in the team's stack is wasted because the spans are non-standard.

The third failure mode is the unaggregated metric. You can see one slow tool call in the trace, but you cannot answer "what is the p95 latency of read_file calls over the last hour?" because there are no metrics, only traces.

The OpenTelemetry GenAI semantic conventions exist exactly for this. They define a small set of standard attributes that span emitters across LLM frameworks share. If your harness writes those attributes, every OTel-compatible backend can read them.

## The Concept
```flow
dir: TB
Call: tool call / model call / gate decision | model
Span: SpanBuilder.span() context manager | step
GenAI: GenAISpan trace_id / span_id / name a... | step
Writer: JSONLWriter | step
Metrics: MetricsRegistry | step
Traces: traces.jsonl | step
Prom: metrics text | step
Call -> Span
Span -> GenAI
GenAI -> Writer
GenAI -> Metrics
Writer -> Traces
Metrics -> Prom
```
Every operation in the harness produces a span. A span has a trace id (the whole agent invocation), a span id (this one operation), a name (e.g. `gen_ai.chat`, `gen_ai.tool.execution`), attributes that follow the GenAI conventions, a start and end time, and a status.

The GenAI conventions standardise these attribute keys: `gen_ai.system` (which provider, e.g. `anthropic`, `openai`), `gen_ai.request.model` (the model id), `gen_ai.request.max_tokens`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.model`, `gen_ai.response.id`, `gen_ai.operation.name`, plus tool-specific keys `gen_ai.tool.name` and `gen_ai.tool.call.id`.

The exporter writes JSONL. One JSON object per line. This is the simplest possible format that downstream tooling can stream, grep, and import. A real OTel exporter would speak OTLP gRPC; the lesson's JSONL exporter is the offline equivalent and exits zero on every workstation.

Metrics live next to traces. A counter increments on each tool call: `tools_called_total{tool="read_file"}`. A histogram records the observed latency: `tool_latency_ms{tool="read_file"}`. Both serialise into Prometheus text exposition format, which is the de-facto standard for pull-based metrics.

## Architecture
```flow
dir: LR
Harness: AgentHarness lessons 25-27 | step
Span: SpanBuilder context mgr / attrs / status | step
Exporter: JSONLExporter traces.jsonl | step
Metrics: MetricsRegistry counters / histograms | step
Prom: Prometheus text exposition | step
Harness -> Span
Span -> Exporter
Span -> Metrics
Metrics -> Prom
```
The span builder is a small class with a `span(name, attrs)` method that returns a context manager. The context manager records start time on enter, records end time on exit, attaches an exception if one was raised, and pushes the finalised span to the exporter.

The metrics registry is two dicts. Counters are `{(name, frozen_labels): int}`. Histograms keep raw samples in a list and serialise to Prometheus histogram buckets at exposition time.

## What you will build

`main.py` ships:

1. `GenAISpan` dataclass: trace_id, span_id, parent_span_id, name, attributes, start_unix_nano, end_unix_nano, status, status_message, events.
2. `SpanBuilder` class with `span(name, attrs, parent=None)` context manager.
3. `JSONLExporter` class with `export(span)` that appends one line.
4. `Counter` and `Histogram` classes plus `MetricsRegistry`.
5. `prometheus_exposition(registry)` that produces text-format output.
6. `wrap_tool_call(name)` decorator that emits a span and updates metrics.
7. Demo: synthesises a complete agent invocation (gen_ai.chat span around tool spans), writes traces.jsonl, prints the Prometheus exposition, exits zero.

The trace id is a 16-byte value (32 hex characters) and the span id is an 8-byte value (16 hex characters), both cut from random `uuid4` hex. That matches the W3C Trace Context sizes OTel uses. The exporter never throws; IO errors are surfaced but the harness keeps running.

The histogram has a fixed bucket set for latency in milliseconds: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, +Inf. It is a trimmed version of the OTel SDK default boundaries, which also include 0, 75, 750, and 7500. Samples are stored as a list; exposition computes per-bucket counts on demand.

## Why hand-rolled instead of opentelemetry-sdk

The OTel Python SDK is a real dependency. It is also several thousand lines of code, a background export thread for the OTLP exporter, and a runtime cost that swamps a lesson budget. The hand-rolled version teaches the wire format. In production you wire the same attributes into the real SDK and get the OTLP exporter, batching, and resource detection for free.

The GenAI conventions are still marked Development in the spec, and they have renamed attributes before: `gen_ai.usage.prompt_tokens` became `gen_ai.usage.input_tokens`. Pin the semantic-conventions version you emit and check it when you upgrade the SDK.

## How this composes with the rest of Track A

Lesson 25 produced the gate chain. Lesson 26 produced the sandbox. Lesson 27 produced the eval harness. Lesson 28 makes all three observable. Lesson 29 wraps every step of the end-to-end demo in spans and prints the Prometheus text at the end.

## Running it
```bash
cd phases/19-capstone-projects/28-observability-otel-traces
python3 code/main.py
python3 -m pytest code/tests/ -v
```
The demo emits a `traces.jsonl` in the lesson's working dir (cleaned up at the end), then prints a sample of three spans, then prints the Prometheus exposition for the counters and histograms. The tests verify that spans serialise round-trip, that the canonical GenAI attributes are present, that counters increment correctly, and that the histogram exposition contains the expected bucket counts.

Source: [AI Engineering from Scratch, phase 19, 28-observability-otel-traces](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/19-capstone-projects/28-observability-otel-traces), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Before reading the lesson: what is the practical benefit of writing your harness's spans in the OTel GenAI attribute shape?
A: Every OTel-compatible backend can read them without a custom parser. The conventions are a contract with the wider ecosystem. Honeycomb, Grafana Tempo, Jaeger, and Datadog all parse gen_ai.* attributes out of the box.
Q: An exception is raised inside a SpanBuilder.span() context. What does the lesson's builder record?
A: status=ERROR, status_message includes the exception type and message, and an 'exception' event is appended. Status ERROR plus an exception event matches the OTel spec. The exception is re-raised so caller code can react.
Q: The Prometheus exposition for a histogram includes _bucket, _sum, and _count lines. Why are bucket counts cumulative (each le bucket includes all smaller buckets)?
A: Cumulative counts let the scraper compute per-bucket counts via subtraction without storing all observations. Prometheus' design choice: a backend reads cumulative counts and computes per-bucket differences. This lets the time series be a simple monotonic counter per bucket.
Q: The harness wraps a tool execution in a span. Which attribute keys identify it as a tool call under the GenAI conventions?
A: gen_ai.tool.name + gen_ai.tool.call.id. gen_ai.tool.name and gen_ai.tool.call.id are the canonical keys for tool executions in the GenAI conventions.
Q: You want to query 'what is the p95 latency of read_file calls'. Which artifact do you query?
A: The Prometheus histogram tool_latency_ms{tool="read_file"} scraped over a window. Histograms are the right tool for percentiles. The counter only counts; the trace contains raw spans but is not pre-aggregated.
Q: A reviewer asks why the lesson hand-rolls instead of importing opentelemetry-sdk. Which answer is correct?
A: Hand-rolling teaches the wire format; the SDK can drop in later with the same attribute keys. The conventions are stable across implementations. The hand-rolled version exists for clarity; production wires in the SDK and reuses the same gen_ai.* keys.
```
