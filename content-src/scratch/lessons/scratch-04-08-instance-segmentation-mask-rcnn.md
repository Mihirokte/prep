---
id: scratch-04-08-instance-segmentation-mask-rcnn
chapter: scratch-04-computer-vision
title: Instance Segmentation: Mask R-CNN
minutes: 0
---
> Add a tiny mask branch to a Faster R-CNN detector and you have instance segmentation. The hard part is RoIAlign, and it is harder than it looks.

**Type:** Build + Learn
**Languages:** Python
**Prerequisites:** Phase 4 Lesson 06 (YOLO), Phase 4 Lesson 07 (U-Net)
**Time:** ~75 minutes

## Learning Objectives

- Trace the Mask R-CNN architecture end-to-end: backbone, FPN, RPN, RoIAlign, box head, mask head
- Implement RoIAlign from scratch and explain why RoIPool is no longer used
- Use the torchvision `maskrcnn_resnet50_fpn_v2` pretrained model for production-quality instance masks and read its output format correctly
- Fine-tune Mask R-CNN on a small custom dataset by replacing the box and mask heads and keeping the backbone frozen

## The Problem

Semantic segmentation gives you one mask per class. Instance segmentation gives you one mask per object, even when two objects share a class. Counting individuals, tracking across frames, and measuring things (the bounding box of each brick in a wall, each cell in a microscope image) all demand instance segmentation.

Mask R-CNN (He et al., 2017) solved this by reframing instance segmentation as detection-plus-a-mask. The design was so clean that for the next five years almost every instance segmentation paper was a Mask R-CNN variant, and the torchvision implementation is still the production default for small to medium datasets.

The hard engineering problem is sampling: how do you crop a fixed-size feature region out of a proposal box whose corners do not align with pixel boundaries? Getting that wrong costs tenths of a mAP point everywhere. RoIAlign is the answer.

## The Concept

### The architecture
```flow
dir: LR
IMG: Input | step
BB: ResNet backbone | step
FPN: Feature Pyramid Network | step
RPN: Region Proposal Network | step
RA: RoIAlign | step
BH: Box head (class + refine) | step
MH: Mask head (14x14 conv) | step
NMS: NMS | step
OUT: boxes + classes + masks | step
IMG -> BB
BB -> FPN
FPN -> RPN
FPN -> RA
RPN -> RA : top-K proposals
RA -> BH
RA -> MH
BH -> NMS
MH -> NMS
NMS -> OUT
```
Five pieces to understand:

1. **Backbone** — ResNet-50 or ResNet-101 trained on ImageNet. Produces a hierarchy of feature maps at strides 4, 8, 16, 32.
2. **FPN (Feature Pyramid Network)** — top-down + lateral connections that give every level C channels of semantic-rich features. Detection queries the FPN level matching the object size.
3. **RPN (Region Proposal Network)** — a small conv head that, at every anchor position, predicts "is there an object here?" and "how do I refine the box?". Produces ~1000 proposals per image.
4. **RoIAlign** — samples a fixed-size (e.g. 7x7) feature patch from any box on any FPN level. Bilinear sampling, no quantisation.
5. **Heads** — two-layer box head that refines the box and picks a class, plus a small conv head that outputs a `28x28` binary mask for each proposal.

### Why RoIAlign, not RoIPool

The original Fast R-CNN used RoIPool, which splits a proposal box into a grid, takes the maximum feature in each cell, and rounds all coordinates to integers. That rounding misaligns the feature map from the input pixel coordinates by up to a full feature-map pixel — small on a 224x224 image, catastrophic when the feature map is stride 32.
```
RoIPool:
  box (34.7, 51.3, 98.2, 142.9)
  round -> (34, 51, 98, 142)
  split grid -> round each cell boundary
  misalignment accumulates at every step

RoIAlign:
  box (34.7, 51.3, 98.2, 142.9)
  sample at exact float coordinates using bilinear interpolation
  no rounding anywhere
```
RoIAlign lifts mask AP by 3-4 points on COCO for free. Every detector that cares about localisation now uses it — YOLOv7 seg, RT-DETR, Mask2Former alike.

### The RPN in one paragraph

At every position of a feature map, place K anchor boxes of different sizes and shapes. Predict an objectness score for each anchor and a regression offset to turn the anchor into a better-fitting box. Keep the top ~1,000 boxes by score, apply NMS at IoU 0.7, and hand the survivors to the heads. The RPN is trained with its own mini-loss — the same structure as the YOLO loss from Lesson 6, just with two classes (object / no object).

### The mask head

For each proposal (after RoIAlign) the mask head is a tiny FCN: four 3x3 convs, a 2x deconv, a final 1x1 conv that produces `num_classes` output channels at `28x28` resolution. Only the channel corresponding to the predicted class is kept; the others are ignored. This decouples mask prediction from classification.

Upsample the 28x28 mask to the proposal's original pixel size to produce the final binary mask.

### Losses

Mask R-CNN has five losses added together:
```math
L = L_{\text{rpn\_cls}} + L_{\text{rpn\_box}} + L_{\text{box\_cls}} + L_{\text{box\_reg}} + L_{\text{mask}}
```
- `L_rpn_cls`, `L_rpn_box` — objectness + box regression for the RPN proposals.
- `L_box_cls` — cross-entropy over (C+1) classes (including background) on the head's classifier.
- `L_box_reg` — smooth L1 on the head's box refinement.
- `L_mask` — per-pixel binary cross-entropy on the 28x28 mask output.

Each loss has its own default weight; the torchvision implementation exposes them as constructor arguments.

### Output format

`torchvision.models.detection.maskrcnn_resnet50_fpn_v2` returns a list of dicts, one per image:
```
{
    "boxes":  (N, 4) in (x1, y1, x2, y2) pixel coordinates,
    "labels": (N,) class IDs, 0 = background so indices are 1-based,
    "scores": (N,) confidence scores,
    "masks":  (N, 1, H, W) float masks in [0, 1] — threshold at 0.5 for binary,
}
```
The mask is full image resolution already. The 28x28 head output has been upsampled internally.

## Build It

### Step 1: RoIAlign from scratch

This is the one component of Mask R-CNN that is simpler to understand as code than as prose.
```python
import torch
import torch.nn.functional as F

def roi_align_single(feature, box, output_size=7, spatial_scale=1 / 16.0):
    """
    feature: (C, H, W) single-image feature map
    box: (x1, y1, x2, y2) in original image pixel coordinates
    output_size: side of the output grid (7 for box head, 14 for mask head)
    spatial_scale: reciprocal of the feature map stride
    """
    C, H, W = feature.shape
    x1, y1, x2, y2 = [c * spatial_scale - 0.5 for c in box]
    bin_w = (x2 - x1) / output_size
    bin_h = (y2 - y1) / output_size

    grid_y = torch.linspace(y1 + bin_h / 2, y2 - bin_h / 2, output_size)
    grid_x = torch.linspace(x1 + bin_w / 2, x2 - bin_w / 2, output_size)
    yy, xx = torch.meshgrid(grid_y, grid_x, indexing="ij")

    gx = 2 * (xx + 0.5) / W - 1
    gy = 2 * (yy + 0.5) / H - 1
    grid = torch.stack([gx, gy], dim=-1).unsqueeze(0)
    sampled = F.grid_sample(feature.unsqueeze(0), grid, mode="bilinear",
                            align_corners=False)
    return sampled.squeeze(0)
```
Every number is at a bilinearly-sampled position. No rounding, no quantisation, no dropped gradients.

### Step 2: Compare to torchvision's RoIAlign
```python
from torchvision.ops import roi_align

feature = torch.randn(1, 16, 50, 50)
boxes = torch.tensor([[0, 10, 20, 100, 90]], dtype=torch.float32)  # (batch_idx, x1, y1, x2, y2)

ours = roi_align_single(feature[0], boxes[0, 1:].tolist(), output_size=7, spatial_scale=1/4)
theirs = roi_align(feature, boxes, output_size=(7, 7), spatial_scale=1/4, sampling_ratio=1, aligned=True)[0]

print(f"shape ours:   {tuple(ours.shape)}")
print(f"shape theirs: {tuple(theirs.shape)}")
print(f"max|diff|:    {(ours - theirs).abs().max().item():.3e}")
```
With `sampling_ratio=1` and `aligned=True`, the two match to within `1e-5`.

### Step 3: Load a pretrained Mask R-CNN
```python
import torch
from torchvision.models.detection import maskrcnn_resnet50_fpn_v2, MaskRCNN_ResNet50_FPN_V2_Weights

model = maskrcnn_resnet50_fpn_v2(weights=MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT)
model.eval()
print(f"params: {sum(p.numel() for p in model.parameters()):,}")
print(f"classes (including background): {len(model.roi_heads.box_predictor.cls_score.out_features * [0])}")
```
46M parameters, 91 classes (COCO). The first class (id 0) is background; everything the model actually detects starts at id 1.

### Step 4: Run inference
```python
with torch.no_grad():
    x = torch.randn(3, 400, 600)
    predictions = model([x])
p = predictions[0]
print(f"boxes:  {tuple(p['boxes'].shape)}")
print(f"labels: {tuple(p['labels'].shape)}")
print(f"scores: {tuple(p['scores'].shape)}")
print(f"masks:  {tuple(p['masks'].shape)}")
```
The mask tensor is shape `(N, 1, H, W)`. Threshold at 0.5 to get a binary mask per object:
```python
binary_masks = (p['masks'] > 0.5).squeeze(1)  # (N, H, W) boolean
```
### Step 5: Swap the heads for a custom class count

The common fine-tuning recipe: reuse the backbone, FPN, and RPN; replace the two classifier heads.
```python
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

def build_custom_maskrcnn(num_classes):
    model = maskrcnn_resnet50_fpn_v2(weights=MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
    in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
    hidden_layer = 256
    model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, hidden_layer, num_classes)
    return model

custom = build_custom_maskrcnn(num_classes=5)
print(f"custom cls_score.out_features: {custom.roi_heads.box_predictor.cls_score.out_features}")
```
`num_classes` must include the background class, so a dataset with 4 object classes uses `num_classes=5`.

### Step 6: Freeze what does not need training

On small datasets, freeze the backbone and the FPN. Only the RPN objectness + regression and the two heads learn.
```python
def freeze_backbone_and_fpn(model):
    # torchvision Mask R-CNN packs the FPN inside `model.backbone` (as
    # `model.backbone.fpn`), so iterating `model.backbone.parameters()` covers
    # both the ResNet feature layers and the FPN lateral/output convs.
    for p in model.backbone.parameters():
        p.requires_grad = False
    return model

custom = freeze_backbone_and_fpn(custom)
trainable = sum(p.numel() for p in custom.parameters() if p.requires_grad)
print(f"trainable after freeze: {trainable:,}")
```
On 500-image datasets this is the difference between convergence and overfitting.

## Use It

The full training loop for Mask R-CNN in torchvision is 40 lines and does not change meaningfully between tasks — swap datasets and go.
```python
def train_step(model, images, targets, optimizer):
    model.train()
    loss_dict = model(images, targets)
    losses = sum(loss for loss in loss_dict.values())
    optimizer.zero_grad()
    losses.backward()
    optimizer.step()
    return {k: v.item() for k, v in loss_dict.items()}
```
The `targets` list must have per-image dicts with `boxes`, `labels`, and `masks` (as `(num_instances, H, W)` binary tensors). The model returns a dict of five losses during training and a list of predictions during eval, keyed on `model.training`.

The `pycocotools` evaluator produces mAP@IoU=0.5:0.95 both for boxes and for masks; you need both numbers to know if the box head or the mask head is the bottleneck.

## Ship It

This lesson produces:

- `outputs/prompt-instance-vs-semantic-router.md` — a prompt that asks three questions and picks instance vs semantic vs panoptic plus the exact model to start with.
- `outputs/skill-mask-rcnn-head-swapper.md` — a skill that generates the 10 lines of code for swapping heads on any torchvision detection model, given the new `num_classes`.

Source: [AI Engineering from Scratch, phase 4, 08-instance-segmentation-mask-rcnn](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/04-computer-vision/08-instance-segmentation-mask-rcnn), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why did Mask R-CNN replace RoIPool with RoIAlign?
A: RoIPool rounds box coordinates to integers at multiple steps, misaligning the feature map from the input pixels by up to a feature-map pixel; RoIAlign uses bilinear sampling with no rounding, preserving localisation. RoIPool's rounding costs up to a stride-sized misalignment (e.g. 32 pixels on a stride-32 feature map). RoIAlign samples at exact float coordinates via bilinear interpolation. The change lifted mask AP by 3-4 points on COCO in the original paper and is now standard in every detector that cares about localisation.
Q: Mask R-CNN's mask head outputs a 28x28 mask per class per proposal. Why per class?
A: Decoupling mask prediction from classification: the mask head only has to learn the shape for each class separately, so the classifier's decision does not affect which mask is produced, only which channel is read at inference. Producing one mask per class per proposal decouples mask shape learning from classification. At inference you read only the channel matching the predicted class. This multi-task decoupling matters because mask shape and class probability are different targets that train with different gradients.
Q: torchvision's Mask R-CNN prediction dict has `labels` that start at 1, not 0. Why?
A: Class 0 is reserved for background; user classes are always 1-based so the classifier head can treat background as a real class with its own logits and gradients. Most detectors treat background as class 0 and explicit foreground classes as 1.C. The softmax over (C+1) classes lets the network learn to actively predict 'no object here' rather than just low confidence on all classes. A dataset with 4 real classes needs num_classes = 5 when swapping the predictor.
Q: You fine-tune Mask R-CNN on a 500-image dataset and val mAP plateaus while train loss keeps dropping. What is the first thing to try?
A: Freeze the backbone and FPN so the model only fine-tunes the RPN and heads; 500 images is too few to update 23M backbone parameters without overfitting. On small datasets you do not have enough signal to fine-tune every parameter. Freezing the pretrained backbone and FPN (ImageNet + COCO features) and training only the RPN objectness head and the two classifier/mask heads is the standard recipe and usually fixes this plateau in one training run.
Q: The FPN inside Mask R-CNN has four levels (P2, P3, P4, P5) at strides 4, 8, 16, 32. Why not just use one level?
A: Objects in natural images span a range of scales; routing each proposal to the FPN level matching its size gives the head a feature map with the right receptive field for that object, which is strictly better than always using one scale. A small object on a stride-32 feature map occupies a single cell, which has almost no spatial information. FPN routes small objects to the high-resolution, shallow levels (P2) and large objects to the low-resolution, deep levels (P5), matching receptive field to object size. This is why every modern detector has a pyramid.
```

===DEEPER===
## Exercises

1. **(Easy)** Verify your RoIAlign against `torchvision.ops.roi_align` on 100 random boxes. Report the max absolute difference. Also run RoIPool (pre-2017 behaviour) and show it diverges by ~1-2 feature-map pixels on boxes near the border.
2. **(Medium)** Fine-tune `maskrcnn_resnet50_fpn_v2` on a 50-image custom dataset (any two classes: balloons, fish, pothole, logos). Freeze the backbone, train for 20 epochs, report mask AP@0.5.
3. **(Hard)** Replace Mask R-CNN's mask head with one that predicts at 56x56 instead of 28x28. Measure mAP@IoU=0.75 before and after. Explain why the gain (or lack of one) matches the expected boundary-precision / memory trade-off.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Mask R-CNN | "Detection plus masks" | Faster R-CNN + a small FCN head that predicts a 28x28 mask per proposal per class |
| FPN | "Feature pyramid" | Top-down + lateral connections that give every stride level C channels of semantic-rich features |
| RPN | "Region proposer" | A small conv head that produces ~1000 object/no-object proposals per image |
| RoIAlign | "No-rounding crop" | Bilinearly samples a fixed-size feature grid from any float-coordinate box |
| RoIPool | "Pre-2017 crop" | Same purpose as RoIAlign but rounds box coordinates; obsolete |
| Mask AP | "Instance mAP" | Average precision computed with mask IoU instead of box IoU; the COCO instance segmentation metric |
| Binary mask head | "Per-class mask" | Predicts one binary mask per class for each proposal; only the predicted class's channel is kept |
| Background class | "Class 0" | The catch-all "no object" class; indices for real classes start at 1 |

## Further Reading

- [Mask R-CNN (He et al., 2017)](https://arxiv.org/abs/1703.06870) — the paper; section 3 on RoIAlign is the critical read
- [FPN: Feature Pyramid Networks (Lin et al., 2017)](https://arxiv.org/abs/1612.03144) — the FPN paper; every modern detector uses it
- [torchvision Mask R-CNN tutorial](https://pytorch.org/tutorials/intermediate/torchvision_tutorial.html) — the reference for the fine-tuning loop
- [Detectron2 model zoo](https://github.com/facebookresearch/detectron2/blob/main/MODEL_ZOO.md) — production implementations with trained weights for nearly every detection and segmentation variant
