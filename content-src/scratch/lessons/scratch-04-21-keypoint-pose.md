---
id: scratch-04-21-keypoint-pose
chapter: scratch-04-computer-vision
title: Keypoint Detection & Pose Estimation
minutes: 0
---
> A pose is a set of ordered keypoints. A keypoint detector is a heatmap regressor. Everything else is bookkeeping.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 4 Lesson 06 (Detection), Phase 4 Lesson 07 (U-Net)
**Time:** ~45 minutes

## Learning Objectives

- Distinguish top-down and bottom-up pose estimation and state when each is used
- Regress heatmaps for K keypoints with a Gaussian-per-keypoint target and extract keypoint coordinates at inference
- Explain Part Affinity Fields (PAFs) and how bottom-up pipelines associate keypoints into instances
- Use MediaPipe Pose or MMPose for production keypoint estimation and understand their output format

## The Problem

Keypoint tasks hide under many names: human pose (17 body joints), face landmarks (68 or 478 points), hand (21 points), animal pose, robotic object pose, medical anatomy landmarks. Every one of them shares the same structure: detect K discrete points on an object and output their (x, y) coordinates.

Pose estimation is the foundation of motion capture, fitness apps, sports analytics, gesture control, animation, AR try-on, and robotic grasping. The 2D case is mature; 3D pose (estimating joint positions in world coordinates from a single camera) is the current research frontier.

The engineering question is scale. A single-image, single-person pose is a 20ms problem. Multi-person pose in a crowd at 30 fps is a different problem with different architectures.

## The Concept

### Top-down vs bottom-up
```flow
dir: LR
A1: Detect person boxes | step
A2: Crop each box | step
A3: Per-box keypoint model (HRNet, ViTPose) | model
B1: One pass over image | step
B2: All keypoint heatmaps + association f... | step
B3: Group keypoints into instances (greed... | step
A1 -> A2
A2 -> A3
B1 -> B2
B2 -> B3
```
- **Top-down** — detect people first, then run a per-person keypoint model on each crop. Highest accuracy; scales linearly with number of people.
- **Bottom-up** — one forward pass predicts all keypoints plus an association field; group them. Constant time regardless of crowd size.

Top-down (HRNet, ViTPose) is the accuracy leader; bottom-up (OpenPose, HigherHRNet) is the throughput leader for crowded scenes.

### Heatmap regression

Instead of regressing `(x, y)` directly, predict an `H x W` heatmap per keypoint with a Gaussian blob centred at the true location.
```math
\text{target}[k, y, x] = \exp\left(-\frac{(x - \mathit{cx}_k)^2 + (y - \mathit{cy}_k)^2}{2 \sigma^2}\right)
```
At inference, the argmax of each heatmap is the predicted keypoint location.

Why heatmaps work better than direct regression: the network's spatial structure (conv feature map) aligns naturally with spatial output. Gaussian targets also regularise — a small localisation error produces a small loss, not zero.

### Sub-pixel localisation

Argmax gives integer coordinates. For sub-pixel precision, refine by fitting a parabola to the argmax and its neighbours, or shift the argmax toward the higher neighbour with `dx = 0.25 * (heatmap[y, x+1] - heatmap[y, x-1])` and the same for `dy`, as the code does.

### Part Affinity Fields (PAFs)

OpenPose's trick for bottom-up association. For each pair of connected keypoints (e.g. left shoulder to left elbow), predict a 2-channel field that encodes the unit vector pointing from one to the other. To associate a shoulder with its elbow, integrate the PAF along the line connecting candidate pairs; the pair with the highest integral is matched.
```
For each connection (limb):
  PAF channels: 2 (unit vector x, y)
  Line integral: sum over sample points of (PAF . line_direction)
  Higher integral = stronger match
```
Elegant and scales to arbitrary crowd sizes without per-person crops.

### COCO keypoints

The standard body-pose dataset: 17 keypoints per person, PCK (Percentage of Correct Keypoints) and OKS (Object Keypoint Similarity) as metrics. OKS is the keypoint analogue of IoU and is what COCO mAP@OKS reports.

### 2D vs 3D

- **2D pose** — image coordinates; solved at production quality (MediaPipe, HRNet, ViTPose).
- **3D pose** — world / camera coordinates; still active research. Common approaches:
  - Lift 2D predictions to 3D with a small MLP (VideoPose3D).
  - Direct 3D regression from image (PyMAF, MHFormer).
  - Multi-view setups (CMU Panoptic) for ground truth.

## Build It

### Step 1: Gaussian heatmap target
```python
import numpy as np
import torch

def gaussian_heatmap(size, cx, cy, sigma=2.0):
    yy, xx = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    return np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma ** 2)).astype(np.float32)

hm = gaussian_heatmap(64, 32, 32, sigma=2.0)
print(f"peak: {hm.max():.3f} at ({hm.argmax() % 64}, {hm.argmax() // 64})")
```
Per-keypoint heatmaps stacked along a channel axis give the full target tensor.

### Step 2: Tiny keypoint head

A U-Net-style model that outputs K heatmap channels.
```python
import torch.nn as nn
import torch.nn.functional as F

class TinyKeypointNet(nn.Module):
    def __init__(self, num_keypoints=4, base=16):
        super().__init__()
        self.down1 = nn.Sequential(nn.Conv2d(3, base, 3, 2, 1), nn.ReLU(inplace=True))
        self.down2 = nn.Sequential(nn.Conv2d(base, base * 2, 3, 2, 1), nn.ReLU(inplace=True))
        self.mid = nn.Sequential(nn.Conv2d(base * 2, base * 2, 3, 1, 1), nn.ReLU(inplace=True))
        self.up1 = nn.ConvTranspose2d(base * 2, base, 2, 2)
        self.up2 = nn.ConvTranspose2d(base, num_keypoints, 2, 2)

    def forward(self, x):
        h1 = self.down1(x)
        h2 = self.down2(h1)
        h3 = self.mid(h2)
        u1 = self.up1(h3)
        return self.up2(u1)
```
Input `(N, 3, H, W)`, output `(N, K, H, W)`. Loss is per-pixel MSE against Gaussian targets.

### Step 3: Inference — extract keypoint coordinates
```python
def heatmap_to_coords(heatmaps):
    """
    heatmaps: (N, K, H, W)
    returns:  (N, K, 2) float coordinates in image pixels
    """
    N, K, H, W = heatmaps.shape
    hm = heatmaps.reshape(N, K, -1)
    idx = hm.argmax(dim=-1)
    ys = (idx // W).float()
    xs = (idx % W).float()
    return torch.stack([xs, ys], dim=-1)

coords = heatmap_to_coords(torch.randn(2, 4, 32, 32))
print(f"coords: {coords.shape}")  # (2, 4, 2)
```
One line at inference. For sub-pixel refinement, interpolate around the argmax.

### Step 4: Synthetic keypoint dataset

Simple: draw four points on a white canvas and learn to predict them.
```python
def make_synthetic_sample(size=64):
    img = np.ones((3, size, size), dtype=np.float32)
    rng = np.random.default_rng()
    kps = rng.integers(8, size - 8, size=(4, 2))
    for cx, cy in kps:
        img[:, cy - 2:cy + 2, cx - 2:cx + 2] = 0.0
    hms = np.stack([gaussian_heatmap(size, cx, cy) for cx, cy in kps])
    return img, hms, kps
```
Easy enough for a tiny model to learn in a minute.

### Step 5: Training
```python
model = TinyKeypointNet(num_keypoints=4)
opt = torch.optim.Adam(model.parameters(), lr=3e-3)

for step in range(200):
    batch = [make_synthetic_sample() for _ in range(16)]
    imgs = torch.from_numpy(np.stack([b[0] for b in batch]))
    hms = torch.from_numpy(np.stack([b[1] for b in batch]))
    pred = model(imgs)
    # Upsample pred to full resolution
    pred = F.interpolate(pred, size=hms.shape[-2:], mode="bilinear", align_corners=False)
    loss = F.mse_loss(pred, hms)
    opt.zero_grad(); loss.backward(); opt.step()
```

## Use It

- **MediaPipe Pose** — Google's production pose estimator; ships WebGL + mobile runtimes with sub-10ms latency.
- **MMPose** (OpenMMLab) — comprehensive research codebase; every SOTA architecture with pretrained weights.
- **YOLOv8-pose** — fastest real-time multi-person pose with a single forward pass.
- **transformers HumanDPT / PoseAnything** — newer vision-language approaches for open-vocabulary pose (any object, any keypoint set).

## Ship It

This lesson produces:

- `outputs/prompt-pose-stack-picker.md` — a prompt that picks MediaPipe / YOLOv8-pose / HRNet / ViTPose given latency, crowd size, and 2D vs 3D need.
- `outputs/skill-heatmap-to-coords.md` — a skill that writes the sub-pixel heatmap-to-coordinate routine used by every production pose model.

Source: [AI Engineering from Scratch, phase 4, 21-keypoint-pose](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/04-computer-vision/21-keypoint-pose), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why do pose models regress heatmaps instead of (x, y) coordinates directly?
A: The spatial structure of a conv feature map aligns with spatial output; a Gaussian heatmap target provides a smooth loss landscape that tolerates small localisation errors, whereas direct coordinate regression is brittle and loses spatial context. Regressing coordinates with MSE asks the network to reduce a 2D position to two scalars, losing the feature-map alignment that CNNs exploit. Heatmap regression gives the network a per-pixel loss that is smooth around the true location and preserves spatial priors. The empirical improvement over coordinate regression is large enough that every modern pose model uses heatmaps.
Q: Top-down pose estimation vs bottom-up: which scales better with crowd size, and why?
A: Bottom-up, because it does one forward pass over the whole image then groups keypoints, so runtime is constant in the number of people. Top-down runs a per-person keypoint model after a person detector, so cost grows linearly with the number of people. Bottom-up (OpenPose, HigherHRNet) produces all keypoints and association fields in one pass, then groups them — constant time regardless of crowd density. The trade: top-down is more accurate per-person; bottom-up is faster in crowds.
Q: What are Part Affinity Fields?
A: 2-channel unit-vector fields that encode the direction from one keypoint to another; integrating the PAF along a candidate line tells you whether two keypoints belong to the same instance, enabling bottom-up association without per-person detection. Per connected keypoint pair (limb), predict a 2-channel field (x, y components of the unit vector pointing from one keypoint to the other). To match a candidate shoulder with a candidate elbow, integrate the PAF along the line joining them; higher integral = stronger match. This turns pose into a bipartite matching problem solvable in polynomial time.
Q: Why does sub-pixel refinement around the argmax meaningfully lift keypoint accuracy?
A: Integer argmax rounds to the nearest grid cell; fitting a local parabola or using the offset dx = 0.25*(heatmap[y,x+1] - heatmap[y,x-1]) recovers the continuous peak position, often halving the L2 error for cleanly predicted keypoints. A well-predicted heatmap has a smooth Gaussian peak whose centre is usually between grid cells. Integer argmax loses that sub-pixel information (up to 0.5 px error). Fitting a parabola or using the first-difference offset recovers the continuous peak. For sports analytics, medical landmarks, or anything requiring precise coordinates, this step is mandatory.
Q: OKS (Object Keypoint Similarity) is the pose-estimation analogue of what object-detection metric?
A: IoU — both measure geometric match between prediction and ground truth, with OKS using keypoint distances weighted by each keypoint's annotation variance; COCO reports mAP@OKS 0.5:0.95 for pose. OKS ranges 0 to 1 like IoU and plays the same role: it decides whether a prediction matches a ground-truth pose at a given strictness level. Each keypoint has a variance (COCO publishes them) that scales its contribution — invariant joints like nose and eyes weigh more than wrists, which are annotated less consistently. COCO Pose AP @ OKS 0.5:0.95 is the 2026 community benchmark.
```

===DEEPER===
## Exercises

1. **(Easy)** Train the tiny keypoint model on the synthetic 4-point dataset. Report mean L2 error between predicted and true keypoints after 200 steps.
2. **(Medium)** Add sub-pixel refinement: given the argmax position, fit a 1D parabola along x and y from the neighbouring pixels. Report the accuracy gain vs integer argmax.
3. **(Hard)** Build a 2-person synthetic dataset where each image shows two instances of the 4-keypoint pattern. Train a bottom-up pipeline with PAFs that predict which keypoint belongs to which instance, and evaluate OKS.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Keypoint | "A landmark" | A specific ordered point on an object (joint, corner, feature) |
| Pose | "The skeleton" | An ordered set of keypoints belonging to one instance |
| Top-down | "Detect then pose" | Two-stage pipeline: person detector + per-crop keypoint model; highest accuracy |
| Bottom-up | "Pose first, group later" | Single-pass all-keypoint prediction + grouping; constant time in crowd size |
| Heatmap | "Gaussian target" | H x W tensor per keypoint with peak at the true location; the preferred regression target |
| PAF | "Part Affinity Field" | 2-channel unit vector field encoding limb directions; used to group keypoints into instances |
| OKS | "Keypoint IoU" | Object Keypoint Similarity; the COCO metric for pose |
| HRNet | "High-Resolution Net" | The dominant top-down keypoint architecture; preserves high-res features throughout |

## Further Reading

- [OpenPose (Cao et al., 2017)](https://arxiv.org/abs/1812.08008) — bottom-up with PAFs; still the best writeup of the approach
- [HRNet (Sun et al., 2019)](https://arxiv.org/abs/1902.09212) — the top-down reference architecture
- [ViTPose (Xu et al., 2022)](https://arxiv.org/abs/2204.12484) — plain ViT as a pose backbone; current SOTA on many benchmarks
- [MediaPipe Pose](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) — production real-time pose; the fastest deployed stack in 2026
