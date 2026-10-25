---
id: scratch-04-18-open-vocab-clip
chapter: scratch-04-computer-vision
title: Open-Vocabulary Vision: CLIP
minutes: 0
---
> Train an image encoder and a text encoder together so that matching (image, caption) pairs land at the same point in a shared space. That is the whole trick.

**Type:** Build + Use
**Languages:** Python
**Prerequisites:** Phase 4 Lesson 14 (ViT), Phase 4 Lesson 17 (Self-Supervised)
**Time:** ~45 minutes

## Learning Objectives

- Explain CLIP's two-tower architecture and contrastive training objective
- Use a pretrained CLIP (or SigLIP) for zero-shot classification without any task-specific training
- Implement zero-shot classification from scratch: encode class prompts, compute cosine similarity, take argmax
- Distinguish CLIP, SigLIP, OpenCLIP, and LLaVA/LLaMA-vision models — what each is for in 2026

## The Problem

Traditional classifiers are closed-vocabulary: a 1000-class ImageNet model can only predict 1000 labels. Every new category requires labelled data and a retrained head.

CLIP (Radford et al., OpenAI 2021) showed that training on 400M (image, caption) pairs scraped from the web produces a model that can classify into any set of categories at inference, described purely in natural language. You give it a new class by writing a sentence.

That capability — zero-shot transfer — is why every modern vision system starts with a CLIP-family checkpoint. Detection (Grounding DINO, OWL-ViT), segmentation (CLIPSeg, SAM), retrieval, content moderation, VLMs, and text-to-image generation all build on CLIP-style joint embeddings.

## The Concept

### Two towers
```flow
dir: LR
IMG: Image | step
IENC: Image encoder (ViT-L/14) | model
IEMB: Image embedding (1024,) | model
TXT: Caption | step
TENC: Text encoder (transformer) | model
TEMB: Text embedding (1024,) | model
SIM: Cosine similarity | step
IMG -> IENC
IENC -> IEMB
TXT -> TENC
TENC -> TEMB
IEMB -> SIM
TEMB -> SIM
```
Both encoders end with a linear projection to the same embedding dimension (512 for CLIP-B/32, 1024 for CLIP-L/14). L2-normalise and compute cosine similarity.

### The objective

Given a batch of $N$ (image, caption) pairs, build an $N \times N$ similarity matrix. Train both encoders so the diagonal (matching pairs) has high similarity and off-diagonals (non-matching) have low similarity.
```
sim_matrix = image_embeddings @ text_embeddings.T / tau

loss_i2t = cross_entropy(sim_matrix,       targets=arange(N))
loss_t2i = cross_entropy(sim_matrix.T,     targets=arange(N))
loss = (loss_i2t + loss_t2i) / 2
```
Symmetric because both image-to-text and text-to-image retrieval should work. `tau` (temperature) is typically learned as a scalar parameter, initialised to 0.07.

### SigLIP: a better loss

SigLIP (Zhai et al., 2023) replaced the softmax with per-pair sigmoid:
```math
\begin{aligned}
\text{loss} &= \mathop{\mathrm{mean}}\limits_{\text{pairs}} \log\left(1 + \exp(-y_{ij} \cdot \text{sim}_{ij})\right) \\
y_{ij} &= \begin{cases} +1 & \text{if matching} \\ -1 & \text{otherwise} \end{cases}
\end{aligned}
```
Per-pair loss removes the batch-level normalisation that CLIP requires. SigLIP trains better at small batch sizes and matches or exceeds CLIP at equal data.

### Zero-shot classification

Given a trained CLIP:

1. For each class, compose a prompt: "a photo of a {class}".
2. Encode all class prompts with the text encoder -> `T` shape (C, d).
3. Encode the test image -> `I` shape (1, d).
4. Similarity = `I @ T.T` shape (1, C).
5. Argmax -> predicted class.

Prompt engineering matters. OpenAI published 80 prompt templates for ImageNet ("a photo of a {}", "a blurry photo of a {}", "a sketch of a {}", ...). Average the embeddings of all templates per class for an extra 1-3% top-1 accuracy.

### Where CLIP-style models are used in 2026

- **Zero-shot classification** — direct use.
- **Image retrieval** — encode all images once, embed query at inference.
- **Text-conditioned detection** — Grounding DINO, OWL-ViT wrap a CLIP text tower around a detector.
- **Text-conditioned segmentation** — CLIPSeg; SAM uses text-prompt inputs via CLIP.
- **VLMs** — LLaVA, Qwen-VL, InternVL wire a CLIP-family vision encoder into an LLM.
- **Text-to-image gen** — Stable Diffusion, DALL-E 3 condition on CLIP text embeddings.

Once you have a shared embedding space, every vision+language task becomes a distance computation.

## Build It

### Step 1: A tiny two-tower model

Real CLIP is ViT + transformer. For this lesson the towers are small MLPs over pre-extracted features so the training signal is visible on CPU.
```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class TwoTower(nn.Module):
    def __init__(self, img_in=128, txt_in=64, emb=64):
        super().__init__()
        self.image_proj = nn.Sequential(nn.Linear(img_in, 128), nn.ReLU(), nn.Linear(128, emb))
        self.text_proj = nn.Sequential(nn.Linear(txt_in, 128), nn.ReLU(), nn.Linear(128, emb))
        self.logit_scale = nn.Parameter(torch.ones([]) * 2.6592)  # ln(1/0.07)

    def forward(self, img_feats, txt_feats):
        i = F.normalize(self.image_proj(img_feats), dim=-1)
        t = F.normalize(self.text_proj(txt_feats), dim=-1)
        return i, t, self.logit_scale.exp()
```
Two projections, shared-dim output, learned temperature. Same shape as the real CLIP API.

### Step 2: Contrastive loss
```python
def clip_loss(image_emb, text_emb, logit_scale):
    N = image_emb.size(0)
    sim = logit_scale * image_emb @ text_emb.T
    targets = torch.arange(N, device=sim.device)
    l_i = F.cross_entropy(sim, targets)
    l_t = F.cross_entropy(sim.T, targets)
    return (l_i + l_t) / 2
```
Symmetric. Higher logit_scale = sharper softmax = more confident but risk of instability.

### Step 3: Zero-shot classifier
```python
@torch.no_grad()
def zero_shot_classify(model, image_feats, class_text_feats, class_names):
    """
    image_feats:      (N, img_in)
    class_text_feats: (C, txt_in)   one averaged embedding per class
    """
    i = F.normalize(model.image_proj(image_feats), dim=-1)
    t = F.normalize(model.text_proj(class_text_feats), dim=-1)
    sim = i @ t.T
    pred = sim.argmax(dim=-1)
    return [class_names[p] for p in pred.tolist()]
```
One line per step. This is the exact zero-shot procedure used with a production CLIP checkpoint.

### Step 4: Sanity check
```python
torch.manual_seed(0)
model = TwoTower()

img = torch.randn(8, 128)
txt = torch.randn(8, 64)
i, t, scale = model(img, txt)
loss = clip_loss(i, t, scale)
print(f"batch size: {i.size(0)}   loss: {loss.item():.3f}")
```
Loss should be close to `log(N) = log(8) = 2.08` for a randomly initialised model — the symmetric cross-entropy target when no structure is learned yet.

## Use It

OpenCLIP is the community default in 2026:
```python
import open_clip
import torch
from PIL import Image

model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
tokenizer = open_clip.get_tokenizer("ViT-B-32")

image = preprocess(Image.open("dog.jpg")).unsqueeze(0)
text = tokenizer(["a photo of a dog", "a photo of a cat", "a photo of a car"])

with torch.no_grad():
    image_features = model.encode_image(image)
    text_features = model.encode_text(text)
    image_features = image_features / image_features.norm(dim=-1, keepdim=True)
    text_features = text_features / text_features.norm(dim=-1, keepdim=True)
    probs = (100.0 * image_features @ text_features.T).softmax(dim=-1)

print(probs)
```
SigLIP is newer, trains better at small scales, and is preferred for new work: `google/siglip-base-patch16-224`. Hugging Face ships both.

## Ship It

This lesson produces:

- `outputs/prompt-zero-shot-class-picker.md` — a prompt that designs class templates for zero-shot CLIP given a list of classes and a domain.
- `outputs/skill-image-text-retriever.md` — a skill that builds an image embedding index with any CLIP checkpoint, supports query-by-text and query-by-image.

Source: [AI Engineering from Scratch, phase 4, 18-open-vocab-clip](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/04-computer-vision/18-open-vocab-clip), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: CLIP's contrastive loss is symmetric (image-to-text + text-to-image). Why both directions?
A: You want both queries to work at inference: text-to-image retrieval and image-to-text retrieval. Training only one direction makes the other direction's accuracy drop significantly. The embedding space needs to be symmetric across modalities because downstream tasks query in both directions. Zero-shot classification is text-to-image (classify image given text prompts). Retrieval can go either way. Training with only i2t or only t2i leaves the other direction weak.
Q: Zero-shot classification with CLIP works by.. ?
A: Encoding prompts like 'a photo of a dog' for each candidate class, encoding the test image, and taking argmax of cosine similarities between the image embedding and all class text embeddings. Zero-shot means no task-specific training: the model's representations already let you compare images to arbitrary text descriptions. Write one prompt per class, encode all prompts and the test image, cosine similarity, argmax. The only 'trick' is prompt engineering — using multiple templates per class and averaging their embeddings gains 1-3 top-1 on ImageNet.
Q: SigLIP replaces CLIP's softmax with a sigmoid loss per pair. What benefit does that give?
A: The sigmoid loss is per-pair, so it does not depend on the batch as a normalisation denominator. SigLIP trains well at smaller batch sizes where CLIP's softmax loss starves for negatives. CLIP's symmetric cross-entropy is a softmax over the whole batch, so effective negatives = batch_size - 1. Small batches starve it. SigLIP is per-pair: each (image, caption) pair gets a binary decision (match or not). No batch-level normalisation, so SigLIP works at batch 128 while CLIP needs 8192. At equal scale SigLIP matches or beats CLIP.
Q: A practitioner reports 88% zero-shot top-1 on CIFAR-10 with CLIP ViT-B/32 and 90% with the same model using 80 prompt templates per class. Why does template averaging help?
A: Different templates activate different aspects of the text encoder's learned distribution; averaging smooths the class embedding over the manifold of plausible natural-language descriptions of the class, producing a more robust centroid. Each template is a different natural-language cue. 'a photo of a dog' emphasises one aspect; 'a blurry photo of a dog' another; 'a sketch of a dog' yet another. Averaging the text embeddings gives a smoother representation of the concept 'dog' that is less sensitive to individual-prompt quirks. The OpenAI CLIP paper published 80 templates that lift ImageNet zero-shot by ~2 points.
Q: Why do modern VLMs (LLaVA, Qwen-VL, InternVL) use a CLIP-family vision encoder instead of a supervised ImageNet ResNet?
A: CLIP features are aligned with natural language, so the LLM can reason about them with less adaptation; supervised ImageNet features were never trained against captions and need heavy projection layers to bridge to text. A VLM bolts a vision encoder to a language model and trains a small projection. CLIP-style encoders were trained against text, so their outputs already live in a space the LLM can consume with a few linear layers of adaptation. Supervised ImageNet encoders have no notion of natural-language structure and require much larger bridging MLPs to work with an LLM. This is why every SOTA VLM uses a CLIP-family vision tower.
```

===DEEPER===
## Exercises

1. **(Easy)** Use a pretrained OpenCLIP ViT-B/32 and do zero-shot classification on CIFAR-10 with the 80-template prompt set. Report top-1 accuracy; it should be around 85-90%.
2. **(Medium)** Compare single-template ("a photo of a {}") vs 80-template averaged embeddings on the same CIFAR-10 task. Quantify the gap and explain why templates help.
3. **(Hard)** Build a zero-shot image retrieval index: embed 1,000 images with CLIP, build a FAISS index, query with a natural language description. Report retrieval recall@5 for 20 held-out queries you write by hand.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Two-tower | "Dual encoder" | Separate image and text encoders ending in a shared-dim projection head |
| Zero-shot | "No task-specific training" | Classify into classes described only by text at inference; no labels touched |
| Temperature / logit_scale | "tau" | Learned scalar that scales the similarity matrix before softmax |
| Prompt template | "A photo of a {}" | Natural-language wrapper around class names; averaging many templates boosts zero-shot accuracy |
| CLIP | "Image+text model" | The 2021 OpenAI model; vocabulary of the field in 2026 |
| SigLIP | "Sigmoid CLIP" | Swaps softmax for per-pair sigmoid; trains better at small batches |
| OpenCLIP | "Open reproduction" | Community-trained CLIP variants on LAION; production default for open-source pipelines |
| VLM | "Vision-language model" | A CLIP-family encoder plus an LLM, trained to answer questions about images |

## Further Reading

- [CLIP: Learning Transferable Visual Models from Natural Language Supervision (Radford et al., 2021)](https://arxiv.org/abs/2103.00020)
- [SigLIP: Sigmoid Loss for Language-Image Pre-Training (Zhai et al., 2023)](https://arxiv.org/abs/2303.15343)
- [OpenCLIP](https://github.com/mlfoundations/open_clip) — the community codebase
- [Oquab et al. (2023). DINOv2: Learning Robust Visual Features without Supervision](https://arxiv.org/abs/2304.07193) — the paper, with feature benchmarks against CLIP-style and MAE-style models
