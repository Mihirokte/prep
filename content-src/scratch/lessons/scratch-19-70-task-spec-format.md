---
id: scratch-19-70-task-spec-format
chapter: scratch-19-capstone-projects
title: Task Spec Format
minutes: 0
---
> An eval harness is only as good as the contract its tasks honour. Freeze the JSONL shape and the metric vocabulary before you write a single scoring function.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 19 Track B foundations
**Time:** ~90 min

## Learning objectives

- Define a JSONL task record schema that covers arithmetic, multiple-choice, code execution, classification, and free-text summarisation in one shape.
- Pin a closed vocabulary of metric names so downstream lessons (71-73) can dispatch on a single field.
- Specify few-shot examples and post-processing rules as part of the task, not the runner, so the same prompt produces the same target across models.
- Implement a strict validator that rejects malformed records before they reach the runner.
- Ship a 10-task fixture set that exercises every branch of the spec so the validator has something real to chew on.

## Why a frozen spec

A research codebase will accumulate eval scripts faster than it accumulates tests. Six months in, every notebook has its own JSON shape, every metric is reimplemented twice, and nothing can be compared across runs. The fix is boring. Pick a schema. Write a validator. Reject everything else. That is what this lesson does.

The shape borrows ideas from BIG-bench, HELM, and lm-eval style harnesses, but the field names are ours. Every field has a single owner. The runner reads the task. The metric reads the targets. The post-process step normalises the generation. No field is mutable mid-pipeline.

## The record shape

A task is a JSON object on a single line. The harness reads `tasks.jsonl` and validates each line independently. A bad line aborts that record, not the run.
```json
{
  "task_id": "arith_001",
  "category": "arithmetic",
  "prompt": "Compute the result. Question: 17 + 24\nAnswer:",
  "targets": ["41"],
  "metric_name": "exact_match",
  "few_shot_examples": [
    {"prompt": "Question: 2 + 2\nAnswer:", "completion": "4"}
  ],
  "post_process": "strip_whitespace",
  "metadata": {"difficulty": "easy"}
}
```
The required fields are `task_id`, `category`, `prompt`, `targets`, `metric_name`, `post_process`. `few_shot_examples` and `metadata` are optional. Unknown top-level fields fail validation.

## Field rules

`task_id` is a string with no whitespace. The validator enforces uniqueness across the file.

`category` is one of `arithmetic`, `mcq`, `code_exec`, `classification`, `summary`. The category constrains which metric and post-process pair is legal. A `code_exec` task must use `metric_name = code_exec` and a `mcq` task must use `metric_name = exact_match` against a single-letter target.

`prompt` is a non-empty string. The validator forbids trailing whitespace and rejects records that already contain a few-shot block in the prompt body. Few-shot rendering happens in the runner, not the author.

`targets` is a non-empty list of strings. For `exact_match`, any element matching counts. For `f1` and `rouge_l`, the highest-scoring target wins. For `mcq`, the list holds exactly one element.

`metric_name` is one of `exact_match`, `f1`, `bleu_4`, `rouge_l`, `accuracy`, `code_exec`. The vocabulary is closed. A new metric requires a new lesson and a new entry here.

`few_shot_examples` is a list of `{prompt, completion}` pairs. The validator caps the list at eight entries to keep prompts bounded.

`post_process` is one of `none`, `strip_whitespace`, `lower`, `extract_letter`, `extract_code_block`, `extract_first_line`. Each rule has a single deterministic behaviour. The validator forbids combining rules.

## Validator behaviour
```flow
dir: TB
A: read tasks.jsonl | step
B: parse line as JSON | step
Z: record error, continue | step
C: check required fields | step
D: check field types | step
E: check category-metric pair | step
F: check task_id uniqueness | step
G: append to validated set | step
H: more lines? | gate
I: return validated, errors | step
A -> B
B -> Z : error
B -> C
C -> Z : missing
C -> D
D -> Z : bad type
D -> E
E -> Z : illegal
E -> F
F -> Z : dup
F -> G
Z -> H
G -> H
H -> B : yes
H -> I : no
```
The validator returns two lists: validated records and error records with the offending line, the violated rule, and the field at fault. The runner refuses to start if the error list is non-empty unless an explicit `--allow-bad-tasks` flag is set.

## Few-shot rendering

The runner concatenates few-shot examples in front of the prompt with a blank line separator. The same code path runs for every model, so the only source of variance is the model itself. Authors write examples once, not once per provider.
```python
def render(task):
    parts = []
    for ex in task.get("few_shot_examples", []):
        parts.append(ex["prompt"] + " " + ex["completion"])
    parts.append(task["prompt"])
    return "\n\n".join(parts)
```

## Post-process rules

The post-process step runs after generation, before the metric. It is deterministic and stateless.

- `none` returns the string unchanged.
- `strip_whitespace` strips leading and trailing whitespace.
- `lower` lowercases the string.
- `extract_letter` returns the first character that matches `[A-E]`, used for MCQ.
- `extract_code_block` returns the body of the first triple-backtick fenced block, used for code-exec.
- `extract_first_line` returns the first non-empty line, used for summary classification.

A task that needs a rule outside this list belongs in a new lesson.

## What this lesson does not do

It does not score. It does not call a model. It does not run code. Those come in lessons 71, 72, and 75. This lesson freezes the contract that all of them honour.

The 10-task fixture covers two arithmetic items, two MCQ items, two code-exec items, two classification items, and two summarisation items. The validator passes on all 10. A separate fixture (`tasks_bad.jsonl`) trips every rule and the validator returns exactly that many errors.

## How to read the code

`main.py` defines `TaskSpec`, `validate_task`, `validate_file`, and a CLI entry point. The fixture loader is `load_fixtures`. The render and post-process helpers live next to validation so the runner in lesson 75 imports a single module.

Read `main.py` top to bottom. Then read `code/tests/test_spec.py`. The tests pin every validation rule and every post-process behaviour. The demo at the bottom of `main.py` validates the bundled fixture and prints a summary.

## Going further

Real eval suites grow categories the way schemas grow columns. The sober move is to refuse to add a category without also adding a metric, a post-process rule, and at least one fixture task. Treat the spec like a database migration. Every change is reviewed, versioned, and accompanied by tests. The validator in this lesson is the gate.

Source: [AI Engineering from Scratch, phase 19, 70-task-spec-format](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/19-capstone-projects/70-task-spec-format), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why freeze the task record schema before writing scoring code?
A: It locks the contract so metrics, runners, and post-processors agree on field names. The schema is the contract every downstream consumer reads from. Locking it lets you change components independently without breaking the rest.
Q: What is the closed vocabulary that the metric_name field accepts?
A: exact_match, f1, bleu_4, rouge_l, accuracy, code_exec. The lesson pins the metric vocabulary to six names. Adding one requires a new lesson and a new validator entry.
Q: What does the validator do when it sees an unknown top-level field on a record?
A: Returns a validation error and rejects the record. Unknown fields are a forward-compatibility hazard. The validator rejects them so the schema stays the only source of truth.
Q: Why are few-shot examples attached to the task record rather than computed by the runner?
A: Author intent is part of the eval; binding examples to the task removes per-model variance in prompt construction. Few-shot composition is part of the eval definition, not the model interface. Putting it in the task means every model sees the same prompt.
Q: Which category-metric pair is illegal under the validator?
A: mcq + bleu_4. BLEU on a single letter is meaningless. The validator enforces that mcq tasks use exact_match or accuracy only.
Q: What does the post_process rule extract_letter return when the generation is `Answer: C is correct`?
A: C. extract_letter returns the first character matching [A-E] in the generation. The string has C at the start of the body.
```
