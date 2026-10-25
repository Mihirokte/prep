---
id: scratch-19-61-cross-attention-fusion
chapter: scratch-19-capstone-projects
title: Cross-Attention Fusion
minutes: 0
---
> The projection layer aligns one image vector with one caption vector. A real vision-language decoder needs every text token to attend to every patch token, so the model can ground each word in a region. Cross-attention is how that grounding happens. The text queries; the vision keys and values answer. This lesson builds the cross-attention block, the causal text self-attention, and the mask shapes that keep both legal.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 19 lessons 30-37 (Track B foundations)
**Time:** ~90 minutes

## Learning Objectives

- Implement multi-head cross-attention where the query stream is text and the key/value stream is vision.
- Compose a decoder block: causal self-attention + cross-attention + feed-forward.
- Get the mask shapes right: causal mask for self-attention, no mask for cross-attention.
- Run a forward pass with batched text tokens and a fixed pool of image tokens.

## The Problem

Concatenating image tokens and text tokens into one sequence is one fusion option (early fusion, the path Chameleon and Emu3 take). Cross-attention is the other (late fusion, the path Flamingo introduced and that every Flamingo-shaped decoder since has copied). In late fusion, the text decoder runs on text-only tokens and reaches over into the image stream through cross-attention at every layer.

Late fusion has two advantages. First, the text stream stays clean and the model preserves text-only capabilities. Second, the image stream is computed once per image and reused for every decode step, so generation is cheap even for long captions. The cost is one extra attention sub-layer per block.

## The Concept
```flow
dir: TB
Image: image tokens B x Nv x D | step
Vis: frozen vision encoder | model
Mem: memory tokens B x Nv x D | store
Text: text token ids | step
Emb: text embedding | model
Self: masked self-attention | step
Cross: cross-attention queries=text keys/val... | store
FFN: feed-forward | step
Out: next-token logits | step
Image -> Vis
Vis -> Mem
Text -> Emb
Emb -> Self
Self -> Cross
Cross -> FFN
FFN -> Out
Mem -> Cross
```

```flow
dir: LR
Q: text Q B x H x Nt x d | step
Scores: Q K^T / sqrt d | step
K: image K B x H x Nv x d | step
Soft: softmax over Nv | step
V: image V B x H x Nv x d | step
Out: output B x H x Nt x d | step
Q -> Scores
K -> Scores
Scores -> Soft
V -> Out
Soft -> Out
```
### Mask shapes

The two attentions inside a decoder block need different masks:

| Attention | Query length | Key length | Mask | Why |
|-----------|--------------|------------|------|-----|
| Self-attention | `Nt` (text) | `Nt` (text) | Causal: lower-triangular `(Nt, Nt)` | Text tokens may not look ahead during autoregression |
| Cross-attention | `Nt` (text) | `Nv` (vision) | No mask | The whole image is visible to every text position |

The lesson includes one shape-validation function so the mistake of mixing them up surfaces as a `ValueError` instead of a silently broken loss curve.

### Why no mask on cross-attention

The image is fully observed before any text is generated. Token `t` of the caption may attend to any patch of the image; there is no temporal order on image patches. Some Flamingo variants add a per-sample masking pattern when interleaving multiple images and text segments, but for a single image plus a caption, cross-attention sees everything.

### Key/value caching

The image keys and values are computed once at the start of the decode and held in a cache. Each new text token uses the cache without recomputation. This is what makes captioning fast at inference: the heavy ViT runs once; the cross-attention reuses its keys and values for every step. The lesson exposes the cache and tests the cache-hit path.

### Block composition

A decoder block runs: pre-LN -> self-attention -> residual -> pre-LN -> cross-attention -> residual -> pre-LN -> feed-forward -> residual. Three sub-layers, each with its own LayerNorm. The Flamingo paper added a learned tanh gate on cross-attention, initialised at zero, so the frozen language model starts out unchanged and training stays stable; the canonical baseline (used here) has no gate.
```python
class DecoderBlock:
  def forward(self, text_tokens, image_tokens, text_mask, cross_mask):
      text_tokens = text_tokens + self.self_attn(self.ln1(text_tokens),
                                                 mask=text_mask)
      text_tokens = text_tokens + self.cross_attn(self.ln2(text_tokens),
                                                  image_tokens,
                                                  mask=cross_mask)
      text_tokens = text_tokens + self.ffn(self.ln3(text_tokens))
      return text_tokens
```

## Build It

`code/main.py` implements:

- `CrossAttention(hidden, heads)`, multi-head cross-attention with separate `q` and `kv` projections.
- `CausalSelfAttention(hidden, heads)`, the masked self-attention from a standard decoder.
- `DecoderBlock`, composing the three sub-layers with pre-LN residuals.
- `VisionLanguageDecoder`, four-layer decoder fed by a mock vision encoder output and a small text embedding table.
- `causal_mask(length)` returning a `(length, length)` lower-triangular boolean tensor.
- A demo that feeds a batch of two text sequences of length 10 with image memory of length 197 and prints output shape, the self-attention mask shape, and the cross-attention output norm per position.

Run it:
```bash
python3 code/main.py
```
Output: decoder produces a `(2, 10, text_vocab)` logits tensor. Mask shape is `(10, 10)`. The KV-cache reuse check confirms identical logits between the cached and uncached paths.

## Use It

Cross-attention shows up in two production families:

- **Flamingo and IDEFICS.** Insert a cross-attention sub-layer every K language model blocks, with a frozen LM. The vision-language adapter is the cross-attention block plus its gate.
- **BLIP-2.** The Q-Former uses cross-attention from a fixed set of 32 query tokens into the image features, then projects the queries into the LM embedding space.

The shape of the block in this lesson maps directly onto both. The mask discipline (causal on self, none on cross) is the same.

## Tests

`code/test_main.py` covers:

- causal mask is lower-triangular and matches expected boolean shape
- cross-attention output shape is `(B, Nt, hidden)` regardless of key length
- KV-cache path matches uncached path to float tolerance
- shape mismatch between text and image streams raises a clear `ValueError`
- a full decoder forward pass produces the right batch and sequence shape

Run them:
```bash
python3 -m unittest code/test_main.py
```

Source: [AI Engineering from Scratch, phase 19, 61-cross-attention-fusion](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/19-capstone-projects/61-cross-attention-fusion), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What is the operational difference between early fusion and late fusion in vision-language modeling?
A: Early fusion concatenates image and text tokens into one sequence; late fusion keeps them separate and bridges via cross-attention at each block. Chameleon and Emu3 are early-fusion; Flamingo and BLIP-2 are late-fusion. The architectural choice changes mask shapes and KV caching.
Q: In a decoder block with both self-attention and cross-attention, which one uses a causal mask?
A: Self-attention only; the image is fully observed and cross-attention has no temporal order. Text generation is autoregressive, so text self-attention is causal. Image tokens are all visible before any text is decoded.
Q: Why is the cross-attention KV cache built once per image?
A: Image keys and values do not change as text is decoded, so projecting memory once and reusing the K and V across all decode steps is the whole inference speedup. The vision encoder runs once. Its KV projection is computed once. Each text token reuses the cache for free.
Q: What is the output shape of cross-attention when text length is Nt=10 and image length is Nv=197 with hidden=256?
A: (B, 10, 256). Cross-attention output shape follows the query stream, so output is (B, Nt, hidden) regardless of key length.
Q: Why is no mask used on cross-attention?
A: The image is fully observed before text generation begins; every text position may attend to every patch. There is no temporal order on image patches and no leakage to prevent, so cross-attention sees the whole image.
Q: Which extension would you add to recover Flamingo-style stability during training?
A: Insert a learned tanh gate on the cross-attention residual so the model can start from text-only behavior and grow into the image stream. Flamingo's tanh gate starts at zero, recovers text-only behavior at init, and gives the model a smooth ramp into cross-attention.
```

===DEEPER===
## Exercises

1. Add a learned tanh gate to the cross-attention residual (the Flamingo trick) and verify training converges from a near-zero initial gate. The gate starts at 0; the model recovers text-only behavior before mixing the image stream in.

2. Implement interleaved attention where the same decoder consumes multiple images plus multiple text segments. Build the per-sample cross-attention mask that prevents text segment 2 from attending to image 1.

3. Profile the cross-attention vs the self-attention layer at `Nt=64, Nv=576` (a 24x24 grid at higher resolution). The cross-attention cost is `Nt * Nv` and dominates at high image resolution.

4. Add a query-side dropout on the cross-attention map and measure caption diversity on the demo (caption sample variance increases with dropout in the cross map).

5. Swap the cross-attention layer for a Q-Former-style attention block where a fixed 32-token query pool attends to image features once per layer.

## Key Terms

| Term | What it means |
|------|---------------|
| Late fusion | Text and vision stay in separate streams; cross-attention bridges them at every block |
| Cross-attention | Q comes from one stream, K and V from another |
| Causal mask | Lower-triangular boolean mask that prevents looking ahead during autoregression |
| KV cache | Image keys and values stored once and reused for every decode step |
| Memory tokens | The frozen image tokens that the decoder reaches into |

## Further Reading

- Flamingo (2022) for the canonical late-fusion design with gated cross-attention.
- BLIP-2 (2023) for the Q-Former, which is a cross-attention block dressed as a learned query pool.
- IDEFICS (2023) for an open-weight reproduction of the Flamingo recipe.
