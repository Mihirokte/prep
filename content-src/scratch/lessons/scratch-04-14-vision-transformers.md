---
id: scratch-04-14-vision-transformers
chapter: scratch-04-computer-vision
title: Vision Transformers (ViT)
minutes: 0
---
> Cut the image into patches, treat each patch as a word, run a standard transformer. Don't look back.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 7 Lesson 02 (Self-Attention), Phase 4 Lesson 04 (Image Classification)
**Time:** ~45 minutes

## Learning Objectives

- Implement patch embedding, learned positional embedding, class token, and transformer encoder blocks from scratch to build a minimal ViT
- Explain why ViT was thought to need massive pretraining data until DeiT and MAE proved otherwise
- Compare ViT, Swin, and ConvNeXt on their architectural priors (none, local window attention, conv backbone)
- Fine-tune a pretrained ViT on a small dataset using `timm` and the standard linear-probe / fine-tune recipe

## The Problem

For a decade, convolution was synonymous with computer vision. CNNs had strong inductive biases — locality, translation equivariance — that nobody thought you could replace. Then Dosovitskiy et al. (2020) showed that a plain transformer applied to flattened image patches, with no convolutional machinery at all, could match or beat the best CNNs at scale.

The catch was "at scale." ViT on ImageNet-1k lost to ResNet. ViT pretrained on ImageNet-21k or JFT-300M then fine-tuned on ImageNet-1k beat it. The conclusion was that transformers lacked useful priors but could learn them from enough data. Subsequent work (DeiT, MAE, DINO) showed that with the right training recipes — strong augmentation, self-supervised pretraining, distillation — ViTs train fine on small data too.

By 2026, pure CNNs are still competitive on edge devices (ConvNeXt is the strongest), but transformers dominate everything else: segmentation (Mask2Former, SegFormer), detection (DETR, RT-DETR), multimodal (CLIP, SigLIP), video (VideoMAE, VJEPA). The ViT block structure is the one to know.

## The Concept

### The pipeline
```flow
dir: LR
IMG: Image (3, 224, 224) | step
PATCH: Patch embedding conv 16x16 s=16 -> (7... | model
FLAT: Flatten to (196, 768) tokens | step
CAT: Prepend [CLS | step
POS: Add learned positional embed | model
ENC: N transformer encoder blocks | model
CLS: Take [CLS | step
HEAD: MLP classifier | model
IMG -> PATCH
PATCH -> FLAT
FLAT -> CAT
CAT -> POS
POS -> ENC
ENC -> CLS
CLS -> HEAD
```
Seven steps. Patches -> tokens -> attention -> classifier. Every variant (DeiT, Swin, ConvNeXt, MAE pretraining) changes one or two of the seven and leaves the rest alone.

### Patch embedding

The first conv is the secret. Kernel size 16, stride 16, so a 224x224 image becomes a 14x14 grid of 16x16 patches, each projected to a 768-dim embedding. That single conv both patchifies and linearly projects.
```
Input:  (3, 224, 224)
Conv (3 -> 768, k=16, s=16, no padding):
Output: (768, 14, 14)
Flatten spatial: (196, 768)
```
196 patches = 196 tokens. Each token's feature dimension is 768 (ViT-B), 1024 (ViT-L), or 1280 (ViT-H).

### Class token

A single learned vector prepended to the sequence:
```
tokens = [CLS; patch_1; patch_2; ...; patch_196]   shape (197, 768)
```
After N transformer blocks, the `[CLS]` output is the global image representation. Classification head reads only this one vector.

### Positional embedding

Transformers have no built-in notion of spatial position. Add a learned vector to every token:
```
tokens = tokens + learned_pos_embedding   (also shape (197, 768))
```
The embedding is a parameter of the model; gradient-based training adapts it to 2D image structure. Sinusoidal 2D alternatives exist but are rarely used in practice.

### Transformer encoder block

Standard. Multi-head self-attention, MLP, residual connections, pre-LayerNorm.
```
x = x + MSA(LN(x))
x = x + MLP(LN(x))

MLP is two-layer with GELU: Linear(d -> 4d) -> GELU -> Linear(4d -> d)
```
ViT-B/16 stacks 12 of these blocks, each with 12 attention heads, totalling 86M parameters.

### Why pre-LN

Early transformers used post-LN (`x = LN(x + sublayer(x))`) and struggled to train past 6-8 layers without warmup. Pre-LN (`x = x + sublayer(LN(x))`) trains deeper networks stably without warmup. Every ViT and every modern LLM uses pre-LN.

### Patch size trade-off

- 16x16 patches -> 196 tokens, standard.
- 32x32 patches -> 49 tokens, faster but lower resolution.
- 8x8 patches -> 784 tokens, finer but $O(n^2)$ attention cost scales badly.

Bigger patches = fewer tokens = faster but less spatial detail. SwinV2 uses 4x4 patches in hierarchical windows.

### DeiT's recipe for training ViT on ImageNet-1k

The original ViT needed JFT-300M to beat CNNs. DeiT (Touvron et al., 2020) trained ViT-B to 81.8% top-1 on ImageNet-1k alone with four changes:

1. Heavy augmentation: RandAugment, Mixup, CutMix, Random Erasing.
2. Stochastic depth (drop entire blocks at random during training).
3. Repeated augmentation (same image sampled 3 times per batch).
4. Distillation from a CNN teacher (optional, lifts accuracy further).

Every modern ViT training recipe descends from DeiT.

### Swin vs ConvNeXt

- **Swin** (Liu et al., 2021) — window-based attention. Each block attends within a local window; alternating blocks shift the window to mix information across windows. Brings back a CNN-like locality prior while keeping the attention operator.
- **ConvNeXt** (Liu et al., 2022) — redesigned CNN that matches Swin's architecture choices (depthwise convs, LayerNorm, GELU, inverted bottleneck). Showed that the gap is not "attention vs convolution" but "modern training recipe + architecture."

In 2026, ConvNeXt-V2 and Swin-V2 are both production-grade; the right choice depends on your inference stack (ConvNeXt compiles better for edge) and pretraining corpus.

### MAE pretraining

Masked Autoencoder (He et al., 2022): mask 75% of patches at random, train the encoder to process only the visible 25%, train a small decoder to reconstruct the masked patches from the encoder's output. After pretraining, discard the decoder and fine-tune the encoder.

MAE makes ViT trainable on ImageNet-1k alone, hits SOTA, and is the current default self-supervised recipe.

## Build It

### Step 1: Patch embedding
```python
import torch
import torch.nn as nn

class PatchEmbedding(nn.Module):
    def __init__(self, in_channels=3, patch_size=16, dim=192, image_size=64):
        super().__init__()
        assert image_size % patch_size == 0
        self.proj = nn.Conv2d(in_channels, dim, kernel_size=patch_size, stride=patch_size)
        num_patches = (image_size // patch_size) ** 2
        self.num_patches = num_patches

    def forward(self, x):
        x = self.proj(x)
        return x.flatten(2).transpose(1, 2)
```
One conv, one flatten, one transpose. That is the entire image-to-tokens step.

### Step 2: Transformer block

Pre-LN, multi-head self-attention, MLP with GELU, residual connections.
```python
class Block(nn.Module):
    def __init__(self, dim, num_heads, mlp_ratio=4, dropout=0.0):
        super().__init__()
        self.ln1 = nn.LayerNorm(dim)
        self.attn = nn.MultiheadAttention(dim, num_heads, dropout=dropout, batch_first=True)
        self.ln2 = nn.LayerNorm(dim)
        self.mlp = nn.Sequential(
            nn.Linear(dim, dim * mlp_ratio),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(dim * mlp_ratio, dim),
            nn.Dropout(dropout),
        )

    def forward(self, x):
        a, _ = self.attn(self.ln1(x), self.ln1(x), self.ln1(x), need_weights=False)
        x = x + a
        x = x + self.mlp(self.ln2(x))
        return x
```
`nn.MultiheadAttention` handles the splitting into heads, the scaled dot-product, and the output projection. `batch_first=True` so shapes are `(N, seq, dim)`.

### Step 3: The ViT
```python
class ViT(nn.Module):
    def __init__(self, image_size=64, patch_size=16, in_channels=3,
                 num_classes=10, dim=192, depth=6, num_heads=3, mlp_ratio=4):
        super().__init__()
        self.patch = PatchEmbedding(in_channels, patch_size, dim, image_size)
        num_patches = self.patch.num_patches
        self.cls_token = nn.Parameter(torch.zeros(1, 1, dim))
        self.pos_embed = nn.Parameter(torch.zeros(1, num_patches + 1, dim))
        self.blocks = nn.ModuleList([
            Block(dim, num_heads, mlp_ratio) for _ in range(depth)
        ])
        self.ln = nn.LayerNorm(dim)
        self.head = nn.Linear(dim, num_classes)
        nn.init.trunc_normal_(self.pos_embed, std=0.02)
        nn.init.trunc_normal_(self.cls_token, std=0.02)

    def forward(self, x):
        x = self.patch(x)
        cls = self.cls_token.expand(x.size(0), -1, -1)
        x = torch.cat([cls, x], dim=1)
        x = x + self.pos_embed
        for blk in self.blocks:
            x = blk(x)
        x = self.ln(x[:, 0])
        return self.head(x)

vit = ViT(image_size=64, patch_size=16, num_classes=10, dim=192, depth=6, num_heads=3)
x = torch.randn(2, 3, 64, 64)
print(f"output: {vit(x).shape}")
print(f"params: {sum(p.numel() for p in vit.parameters()):,}")
```
About 2.8M parameters — a tiny ViT tractable on CPU. Real ViT-B is 86M; same class definition with `dim=768, depth=12, num_heads=12`.

### Step 4: Sanity check — single image inference
```python
logits = vit(torch.randn(1, 3, 64, 64))
print(f"logits: {logits}")
print(f"probs:  {logits.softmax(-1)}")
```
Should run without error. Probabilities sum to 1.

## Use It

`timm` ships every ViT variant with ImageNet pretrained weights. One line:
```python
import timm

model = timm.create_model("vit_base_patch16_224", pretrained=True, num_classes=10)
```
`timm` is the production default for vision transformers in 2026. Supports ViT, DeiT, Swin, Swin-V2, ConvNeXt, ConvNeXt-V2, MaxViT, MViT, EfficientFormer, and dozens of others under the same API.

For multi-modal work (image + text), `transformers` ships CLIP, SigLIP, BLIP-2, LLaVA. The image encoder in all of those is a ViT variant.

## Ship It

This lesson produces:

- `outputs/prompt-vit-vs-cnn-picker.md` — a prompt that picks between a ViT, a ConvNeXt, or a Swin based on dataset size, compute, and inference stack.
- `outputs/skill-vit-patch-and-pos-embed-inspector.md` — a skill that verifies a ViT's patch embedding and positional embedding shapes match the model's expected sequence length, catching the most common porting bugs.

Source: [AI Engineering from Scratch, phase 4, 14-vision-transformers](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/04-computer-vision/14-vision-transformers), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: How does a ViT turn an image into a sequence of tokens?
A: Applies a conv with kernel_size = stride = patch_size to split the image into non-overlapping patches and linearly project each to a token embedding in one operation. The first layer of a ViT is a conv with kernel_size = stride = 16, turning a 224x224 image into a 14x14 grid of 16x16 patches, each projected to dim=768. That single conv does both patchification and projection. The result is 196 tokens that a standard transformer encoder can process.
Q: What is the [CLS] token in ViT and why is it needed?
A: A learned vector prepended to the token sequence; after N transformer layers its output aggregates the whole image and feeds the classifier head. ViT follows BERT's convention: prepend a learned vector (the CLS token) to the patch sequence. Self-attention lets every token see every other token, so the CLS token aggregates global information from all patches. The classifier reads only the CLS output. Alternative designs use average-pooling over all patch tokens (used by ConvNeXt and many post-ViT models).
Q: Why did the original ViT paper need JFT-300M pretraining to beat ResNet, and why does DeiT not?
A: ViT has weaker inductive biases than CNNs; without enough data it overfits. DeiT showed that with strong augmentation (RandAugment, Mixup, CutMix), stochastic depth, and optionally CNN distillation, ViTs train fine on ImageNet-1k alone. ViT's lack of inductive bias (no locality, no translation equivariance baked in) means the network has to learn these from data. With 1M ImageNet images that is hard; with 300M JFT images it is easy. DeiT replaced the data with training-recipe improvements: heavy augmentation, stochastic depth, and distillation from a CNN teacher, all of which compensate for the lack of priors.
Q: Pre-LayerNorm (`x = x + sublayer(LN(x))`) vs post-LayerNorm (`x = LN(x + sublayer(x))`) — which is used in modern transformers and why?
A: Pre-LN; it trains deeper networks stably without learning-rate warmup and avoids the gradient instabilities that post-LN suffers past about 6 layers. Post-LN was the original transformer (2017) and required careful warmup + small learning rates past 6-8 layers. Pre-LN (Xiong et al., 2020; used by ViT, GPT-2+, every modern LLM) is numerically more stable: the residual stream accumulates without passing through LN, and each sublayer operates on a normalised input. Every transformer deeper than 12 layers uses pre-LN.
Q: Swin Transformer introduces windowed attention. What problem does it solve?
A: Full attention has O((H*W)^2) cost; Swin restricts attention to local windows of 7x7 patches, reducing cost to O(H*W * window^2). Alternating blocks shift the window by half its size so information eventually mixes across the image. A 224x224 image with 4x4 patches has 56*56 = 3136 tokens; full attention is 3136^2 = ~10M pairs per layer. Swin attends only within 7x7 windows, giving 49^2 = 2401 pairs per window (plus the window count). Shifted windows in alternating blocks mix information across windows over a few layers. This brings a CNN-like locality prior back to the transformer without giving up attention.
```

===DEEPER===
## Exercises

1. **(Easy)** Print the shapes of every intermediate tensor for a forward pass through the tiny ViT above. Confirm: input `(N, 3, 64, 64)` -> patches `(N, 16, 192)` -> with CLS `(N, 17, 192)` -> classifier input `(N, 192)` -> output `(N, num_classes)`.
2. **(Medium)** Fine-tune a pretrained `timm` ViT-S/16 on the synthetic-CIFAR dataset from Lesson 4. Compare against ResNet-18 fine-tuning on the same data. Report training time and final accuracy.
3. **(Hard)** Implement MAE pretraining for the tiny ViT: mask 75% of patches, train the encoder + a small decoder to reconstruct the masked patches. Evaluate linear-probe accuracy on the synthetic data before and after pretraining.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Patch embedding | "The first conv" | A conv with kernel size = stride = patch size; turns the image into a grid of token embeddings |
| Class token | "[CLS]" | A learned vector prepended to the token sequence; its final output is the global image representation |
| Positional embedding | "Learned pos" | A learned vector added to every token so the transformer knows where each patch came from |
| Pre-LN | "LayerNorm before sublayer" | The stable transformer variant: `x + sublayer(LN(x))` instead of `LN(x + sublayer(x))` |
| Multi-head attention | "Parallel attention" | Standard transformer attention split into num_heads independent subspaces, concatenated afterwards |
| ViT-B/16 | "Base, patch 16" | The canonical size: dim=768, depth=12, heads=12, patch_size=16, image=224; ~86M params |
| DeiT | "Data-efficient ViT" | ViT trained on ImageNet-1k alone with strong augmentation; proved large pretraining datasets are not strictly required |
| MAE | "Masked autoencoder" | Self-supervised pretraining: mask 75% of patches, reconstruct; the dominant ViT pretraining recipe |

## Further Reading

- [An Image is Worth 16x16 Words (Dosovitskiy et al., 2020)](https://arxiv.org/abs/2010.11929) — the ViT paper
- [DeiT: Data-efficient Image Transformers (Touvron et al., 2020)](https://arxiv.org/abs/2012.12877) — how to train ViT on ImageNet-1k alone
- [Masked Autoencoders are Scalable Vision Learners (He et al., 2022)](https://arxiv.org/abs/2111.06377) — MAE pretraining
- [timm documentation](https://huggingface.co/docs/timm) — the reference for every vision transformer you will use in production
