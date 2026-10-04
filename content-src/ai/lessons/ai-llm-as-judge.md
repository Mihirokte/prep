---
id: ai-llm-as-judge
chapter: ai-production
title: Using an LLM as judge
minutes: 8
---
Using an LLM to score another LLM's output is now standard, because human review of every output does not scale and open-ended generation has no deterministic scorer. But 2024 and 2025 research documents specific, reproducible biases, so the correct mental model is a measurement instrument that needs calibrating, not an oracle. An interviewer who hears you treat a judge score as ground truth has their answer; one who hears you talk about validating it against humans knows you have shipped one.

## Pointwise vs pairwise

The first design choice is what you ask the judge to do.

- **Pointwise** scoring hands the judge one output and asks for an absolute score, say 1 to 5 or pass/fail against a rubric. Simple and it scales to a single candidate, but absolute scores are unstable: the same output can draw a 3 one run and a 4 the next, and the scale drifts between batches.
- **Pairwise** comparison hands the judge two outputs and asks which is better. Humans and models are both far more reliable at relative judgements than absolute ones, so pairwise is the more trustworthy signal when you are comparing two systems or two prompts.

The decision rule: use pairwise when you are choosing between candidates, which is most A/B and regression work, and reserve pointwise for when you genuinely need a standalone score and have calibrated the rubric.

## The documented biases

Every one of these is paper-backed, and naming them is the fastest way to show you know the failure modes.

| Bias | What the judge does | Mitigation |
|---|---|---|
| Position | favours the first (or last) option in a pairwise prompt | randomise order, score both orders and average |
| Verbosity | rates longer answers higher regardless of quality | control for length, penalise padding in the rubric |
| Self-preference | favours outputs in its own style or from its own family | use a different model family as judge where possible |
| Provenance | rates the same content differently by claimed source | blind the source before judging |
| Fragility | flips verdict on repeated runs of the same case | measure variance, average over runs |

```flow
dir: LR
cand: Candidate pair | step
blind: Blind and shuffle | gate
judge: LLM judge | model
agg: Average both orders | step
human: Human sample | actor
check: Agreement check | gate
cand -> blind : two outputs
blind -> judge : order randomized
judge -> agg : two verdicts
agg -> check : judge score
human -> check : labels
check -> judge : trust only if agreement holds
```

## Calibration against human labels

A judge is trustworthy only to the degree it agrees with humans on cases you have labelled. The standard measure is Cohen's kappa, which corrects raw agreement for the agreement you would get by chance. Its formula is (observed agreement minus expected agreement) divided by (1 minus expected agreement), so a kappa of 1 is perfect, 0 is chance-level, and negative means systematically worse than chance.

> **Numbers.** The Landis and Koch (1977) bands, widely used for inter-rater agreement: 0.0 to 0.2 slight, 0.2 to 0.4 fair, 0.4 to 0.6 moderate, 0.6 to 0.8 substantial, 0.8 to 1.0 almost perfect. Many teams treat substantial, kappa above about 0.6 to 0.7, as the bar before a judge gates releases, but the threshold is a convention, not a law, pick it for the stakes.

Why kappa and not raw percent agreement: if 95 percent of your cases are pass, a judge that blindly says pass agrees 95 percent of the time while measuring nothing. Kappa strips out that chance agreement, so it exposes a judge that looks accurate only because the labels are imbalanced.

## Rubric design

The rubric is the judge's spec, and a vague rubric is the single biggest source of judge noise. A good rubric is concrete and decomposed: instead of rate the answer 1 to 5, define each level with an observable criterion, or better, ask a sequence of yes/no questions (is every claim supported, does it answer the question, is it free of PII) and compose the score from those. Binary sub-questions are far more stable across runs than a holistic number, and they localise why an output failed.

## Trade-offs

| Choice | Scales | Stable across runs | Localises failure |
|---|---|---|---|
| Human review | no | yes | yes |
| Pointwise judge | yes | weakly | partly |
| Pairwise judge | yes | better | partly |
| Binary rubric questions | yes | best | yes |

```recall
Q: Why prefer pairwise comparison over pointwise scoring for A/B work?
A: Models and humans are more reliable at relative than absolute judgements, so pairwise gives a more stable signal when choosing between two candidates. Pointwise scores drift and are noisy run to run.
Q: Why report Cohen's kappa instead of raw percent agreement for judge-vs-human?
A: Raw agreement is inflated by chance when labels are imbalanced, so a judge that always says pass can look accurate while measuring nothing. Kappa subtracts chance agreement and exposes that.
Q: Name two biases that follow from the prompt structure and their fixes.
A: Position bias is fixed by randomising or averaging over both orderings; verbosity bias is fixed by controlling for length and penalising padding in the rubric.
Q: Why decompose a rubric into binary yes/no questions instead of a 1 to 5 score?
A: Binary sub-questions are far more stable across runs than a holistic number and they localise which criterion failed, so the judge is both more reliable and more diagnostic.
Q: You validated a judge last quarter. Why re-validate after swapping the judge model?
A: Biases and agreement are specific to the model and prompt, so a new judge model can introduce self-preference or shift calibration. Agreement must be re-measured before the new judge gates releases.
```

===DEEPER===

### Why self-preference is the quiet one

Position and verbosity bias are easy to see and easy to control. Self-preference is more insidious: a judge from the same model family as one of the candidates systematically rates that candidate higher because its outputs match the judge's own stylistic priors, not because they are better. In a bake-off where you are deciding whether to switch from model A to model B, using model A as the judge quietly tilts the result toward A. The mitigation is to judge with a different model family from either candidate where you can, and at minimum to disclose the judge's identity when reporting a comparison, because a comparison judged by one of the contestants is not a clean result.

### Measuring the judge's own variance

Before a judge gates anything, run it two or three times on the same identical inputs and measure how often it changes its verdict. A judge that flips 15 percent of its pass/fail calls on re-run cannot gate a merge on a 2 point change, because the gate noise swamps the signal. Two fixes: lower the judge's temperature toward 0 to cut sampling variance, and average over several runs for high-stakes decisions. Report the judge's self-consistency alongside its human agreement, both are properties of your instrument and both bound what you can conclude from its scores.

### Validating and the sampling cost

Calibration is not free: you need human labels on a sample large enough that the kappa estimate is itself stable, which pulls in the same binomial-confidence reasoning as dataset sizing. A kappa computed on 20 cases is almost meaningless; a few hundred labelled cases gives a kappa you can act on. The practical loop: label a validation sample by hand, compute the judge's kappa against those labels, and if it clears your bar, let the judge score the much larger unlabelled set, re-validating on a fresh human sample periodically because both the model and your inputs drift. The judge extends human judgement to scale, it does not replace the human labels that anchor it (as of 2026, re-check tooling for automated agreement tracking).

### A debugging note

When a judge pipeline misbehaves, the usual root cause is not the model but the rubric or the harness: an ambiguous rubric level, a prompt that leaks the expected answer, order that is never shuffled, or provenance that is never blinded. Audit those before blaming the judge model, because a sharper rubric and a blinded, order-randomised harness fix most judge pathologies without touching the model at all.
