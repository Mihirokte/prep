---
id: ai-sampling
chapter: ai-foundations
title: Sampling and determinism
minutes: 7
---
At each step the model outputs a score for every token in its vocabulary. How those scores become the next token is sampling, and it is the knob that decides whether the model is a careful extractor or a creative writer. Interviewers ask about this to see whether you know that temperature 0 is not a guarantee of determinism, and that the right setting depends on the task.

## From logits to a token

The raw per-token scores are logits. Softmax turns them into a probability distribution. Sampling then picks a token from that distribution. The decoding parameters reshape the distribution before the pick.

```flow
dir: LR
logits: Raw logits | model
temp: Temperature scale | step
soft: Softmax | step
trunc: top-p / top-k cut | gate
pick: Sample token | step
logits -> temp : scores
temp -> soft : scaled
soft -> trunc : probabilities
trunc -> pick : kept set
```

- Temperature divides the logits before softmax. Low temperature sharpens the distribution toward the top token; high temperature flattens it, giving rarer tokens a chance.
- Top-k keeps only the k highest-probability tokens, then renormalises and samples among them.
- Top-p (nucleus) keeps the smallest set of tokens whose probabilities sum to at least p, then samples among them. It adapts the cut to how peaked the distribution is.

## What temperature actually does to the distribution

```bars
title: Effect of temperature on token probability (illustrative)
unit: percent
Top token at temp 0.2 | 92
Top token at temp 0.7 | 61
Top token at temp 1.2 | 38
```

Lower temperature concentrates mass on the single best token, so output is more repetitive and predictable. Higher temperature spreads mass out, so output is more varied but more likely to drift or err. These numbers are illustrative, the exact shape depends on the model and the context.

## Which setting for which task

| Task | Temperature | top-p | Why |
|---|---|---|---|
| Extraction, classification, structured output | 0 to 0.2 | 1.0 | Want the single most-likely, repeatable answer |
| Code generation | 0 to 0.3 | 0.9 to 1.0 | Correctness over variety |
| Summarisation, QA | 0.2 to 0.5 | 0.9 | Slight variation, stay grounded |
| Brainstorming, creative drafts | 0.7 to 1.0 | 0.9 to 1.0 | Want diversity across runs |

> **Rule of thumb.** Change one of temperature or top-p, not both at once. They both prune the distribution, so tuning them together makes the effect hard to reason about.

## Temperature 0 is not guaranteed deterministic

Setting temperature to 0 makes the model pick the top token (greedy decoding), which should be deterministic in theory. In practice, hosted APIs are documented as non-deterministic by default. OpenAI states plainly that chat completions are non-deterministic and that even with a fixed `seed` and matching `system_fingerprint`, outputs are only mostly identical, with a small chance of divergence due to the inherent non-determinism of the models (OpenAI API docs and cookbook, as of 2026, re-check).

The causes are structural, not sampling noise: floating-point addition is not associative, so GPU kernels that sum in a different order give slightly different logits; batching and mixture-of-expert routing can change the computation depending on what else is in the batch; and backend configuration can change under you, which the `system_fingerprint` field is meant to signal.

> **Pitfall.** Writing an eval or a cache key that assumes temperature 0 means identical output. The rerun can differ on the same prompt, breaking exact-match caches and flaky-looking tests. Compare semantically or pin to a specific model and accept small variation.

## Seeds and reproducibility

Some providers expose a `seed` parameter to request reproducible sampling, and a `system_fingerprint` to tell you when the backend changed. Use them to reduce variance, but treat exact reproducibility as best-effort, not contractual. For anything that must be stable (regression evals, audit trails), log the full request, the model id, the fingerprint, and the raw output, so you can detect drift rather than assume it away.

```python
# Sketch: extraction wants determinism-as-far-as-possible
resp = client.generate(
    model="a-small-fast-model",
    prompt=prompt,
    temperature=0,      # greedy
    top_p=1.0,
    seed=42,            # best-effort reproducibility
    max_tokens=256,
)
log(resp.system_fingerprint, resp.text)  # record to detect backend drift
```

```recall
Q: Temperature and top-p both reduce randomness. Why change only one?
A: They both prune the probability distribution, so tuning both at once makes their combined effect hard to predict and tune. Fix one, vary the other.
Q: Why can temperature 0 still produce different outputs across identical runs?
A: Non-associative floating-point sums, batch-dependent and MoE-routing computation, and backend changes make the logits vary slightly, so greedy decoding can flip the top token. It is structural, not sampling noise.
Q: You are extracting fields into JSON. What sampling settings and why?
A: Low temperature (0 to 0.2), top-p 1.0, want the single most-likely, stable answer, not variety.
Q: What does a seed buy you, and what does it not?
A: It reduces run-to-run variance and, with a matching fingerprint, makes output mostly repeatable, but it does not guarantee bit-identical results on hosted models.
```

===DEEPER===

### The math of temperature

Given logits z, temperature T rescales them before softmax:

```text
p_i = softmax(z_i / T) = exp(z_i / T) / sum_j exp(z_j / T)
```

As T approaches 0, the term for the largest logit dominates and p approaches a one-hot vector at the argmax (greedy). As T grows, the exponents shrink toward each other and p approaches a uniform distribution. T = 1 leaves the model's native distribution unchanged. Note T = 0 is a special case implemented as argmax, not a literal division by zero.

### Top-k versus top-p

Top-k is a fixed-size cut: always keep k tokens regardless of how confident the model is. That is wrong in both directions, too permissive when the model is sure (one token has 0.98 mass, but you still keep k of them) and too restrictive when the model is unsure (mass is spread over hundreds of tokens but you keep only k). Top-p adapts: when the model is confident, the nucleus is tiny; when it is unsure, the nucleus grows. This is why top-p is the more common default. Some stacks apply both, and may add repetition or frequency penalties and min-p cutoffs on top.

### Why determinism matters for evals and the honest workaround

If you cannot get bit-identical outputs, you cannot write exact-match regression tests that are stable, and a cache keyed on the exact prompt may store a value you cannot reproduce for debugging. The practical answers: (1) pin the model version and seed, and accept that most runs match; (2) grade evals with tolerance, by semantic equality, by an LLM-as-judge, or by field-level comparison for structured output, rather than string equality; (3) log everything (model id, fingerprint, parameters, output) so drift is observable. OpenAI documents the seed-and-fingerprint approach as a best-effort tool for exactly this, while stating that a small chance of divergence remains (OpenAI, reproducible outputs with the seed parameter, as of 2026).
