---
id: ai-evals
chapter: ai-production
title: Evals: the part everyone calls the hard part
minutes: 5
---
Every primary source consulted names evaluation as *the* hard part of AI engineering. Chip Huyen, asked directly: *"there is no single, simple solution to evaluation... a combination of methods is required... Do not skip the hard and manual work. Manual data inspection is critical and still offers the highest ratio of value."*

Two axes you'll be asked to design across:

- **Offline evaluation** — run before deploy against a fixed set: golden examples, adversarial cases, and regression cases harvested from past failures. Cheap to iterate, but only as good as your dataset's coverage of real usage.
- **Online evaluation** — measure against live traffic: user signals (thumbs up/down, edits, re-asks), sampled human review, and automated production metrics. Necessary because offline sets go stale and can't anticipate every real input.

Neither substitutes for direct human inspection of real outputs, and it's not "pick one" — you need both plus the manual work.

A concrete design worth having ready: for a RAG chatbot, **evaluate retrieval and generation separately** — retrieval metrics (recall@k, MRR) tell you if the right chunks came back; generation metrics (faithfulness, relevance) tell you if the model used them well. Conflating the two hides which half is broken.

===DEEPER===
**Deeper mechanism.** Evals split along two axes you should name explicitly.

*Offline vs. online:*
- **Offline** runs pre-deploy against a fixed dataset — cheap, repeatable, gates every prompt/model change. Blind spot: only as good as dataset coverage; goes stale as real inputs drift.
- **Online** measures live traffic — user signals (👍/👎, edits, re-asks), sampled human review, production metrics. Catches the real distribution but is slower and noisier to attribute.

*Dataset construction* (the part people skip and Huyen calls the highest-value manual work): seed with **golden examples** (known-good Q/A), add **adversarial cases** (edge inputs, prompt injections), and continuously **harvest regressions** from production failures so every fixed bug becomes a permanent test. Aim for coverage of real usage, not volume.

*Metrics by task:* classification → precision/recall/F1; retrieval → recall@k, MRR, nDCG; generation → faithfulness (is it grounded in context?), answer relevance, and often an LLM-judge score validated against humans.

```mermaid
sequenceDiagram
    participant Dev
    participant Off as Offline eval set
    participant Prod as Production traffic
    Dev->>Off: run new prompt/model (gate)
    Off-->>Dev: regression? block
    Dev->>Prod: ship behind A/B
    Prod-->>Dev: online signal (success/edit/thumbs)
    Note over Dev: harvest failures back into Off
```

**Worked example.** RAG support bot. Build 200 golden (question, expected-answer, expected-source-doc) triples. Retrieval eval: does the expected source appear in top-k? → recall@k = 0.86. Generation eval, run only on cases where retrieval succeeded: is the answer faithful to the retrieved chunk (LLM-judge + 50 human-labelled spot checks)? Splitting them reveals "generation looks 92% good but recall@5 is only 0.71" — so the fix is chunking/reranking, not the prompt.

**The pitfall.** A single blended "is the answer good?" score. When it dips you can't tell if retrieval missed the doc or the model reasoned badly over a good doc — completely different fixes. Always decompose. Second pitfall: trusting offline numbers alone; they can't anticipate the live input distribution.

**Common follow-ups**

- *Why not just eyeball outputs?* Manual inspection is essential (highest value/ratio per Huyen) but doesn't scale — pair it with automated offline + online eval, don't replace it.
- *How do you build the dataset?* Golden + adversarial + harvested regressions; grow it from real failures over time.
- *Offline said +5%, online flat — why?* Offline set doesn't match production distribution; the online A/B is the real gate.
- *How do you eval a RAG system?* Retrieval and generation separately (recall@k / MRR vs. faithfulness / relevance) so you know which half to fix.
- *(2026, fast-moving)* Eval tooling (RAGAS, DeepEval, LangSmith, Braintrust, Phoenix) churns fast — pick by taxonomy fit, not a blog ranking, and re-check current options.
