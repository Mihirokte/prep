---
id: scratch-04-27-multi-object-tracking
chapter: scratch-04-computer-vision
title: Multi-Object Tracking & Video Memory
minutes: 0
---
> Tracking is detection plus association. Detect every frame. Match this frame's detections to last frame's tracks by ID.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 4 Lesson 06 (YOLO Detection), Phase 4 Lesson 08 (Mask R-CNN), Phase 4 Lesson 24 (SAM 3)
**Time:** ~60 minutes

## Learning Objectives

- Distinguish tracking-by-detection from query-based tracking and name the algorithm families (SORT, DeepSORT, ByteTrack, BoT-SORT, SAM 2 memory tracker, SAM 3.1 Object Multiplex)
- Implement IoU + Hungarian assignment from scratch for classic tracking-by-detection
- Explain SAM 2's memory bank and why it handles occlusion better than IoU-based association
- Read the three tracking metrics (MOTA, IDF1, HOTA) and pick which one matters for a given use case

## The Problem

A detector tells you where the objects are in a single frame. A tracker tells you which detection in frame `t` is the same object as a detection in frame `t-1`. Without that, you cannot count objects crossing a line, follow a ball through an occlusion, or know "car #4 has been in the lane for 8 seconds."

Tracking is essential to every video-facing product: sports analytics, surveillance, autonomous driving, medical video analysis, wildlife monitoring, wordmark counting. The core building blocks are shared: a per-frame detector, a motion model (Kalman filter or something richer), an association step (Hungarian algorithm on IoU / cosine / learned features), and a track lifecycle (birth, update, death).

2026 brought two new patterns: **SAM 2 memory-based tracking** (feature-memory instead of motion-model association) and **SAM 3.1 Object Multiplex** (shared memory for many instances of the same concept). This lesson walks the classical stack first, then the memory-based approach.

## The Concept

### Tracking-by-detection
```flow
dir: LR
F1: Frame t | step
DET: Detector | step
D1: Detections at t | step
PREV: Tracks up to t-1 | step
PREDICT: Motion predict (Kalman) | step
PRED: Predicted tracks at t | step
ASSOC: Hungarian assignment (IoU / cosine /... | step
UPDATE: Update matched tracks | step
NEW: Birth new tracks | step
DEAD: DEAD | step
NEXT: Tracks at t | step
F1 -> DET
DET -> D1
PREV -> PREDICT
PREDICT -> PRED
D1 -> ASSOC
PRED -> ASSOC
ASSOC -> UPDATE
ASSOC -> NEW
ASSOC -> DEAD
UPDATE -> NEXT
NEW -> NEXT
DEAD -> NEXT
```
Every tracker you will encounter in 2026 is a variation on this loop. The differences:

- **SORT** (2016): Kalman filter + IoU Hungarian. Simple, fast, no appearance model.
- **DeepSORT** (2017): SORT + a CNN-based appearance feature per track (ReID embedding). Handles crossings better.
- **ByteTrack** (2021): associates low-confidence detections as a second stage; no appearance features needed but top performer on MOT17.
- **BoT-SORT** (2022): Byte + camera motion compensation + ReID.
- **StrongSORT / OC-SORT** — ByteTrack descendants with better motion and appearance.

### Kalman filter in one paragraph

A Kalman filter maintains a per-track state `(x, y, w, h, dx, dy, dw, dh)` with a covariance. At each frame, **predict** the state using a constant-velocity model, then **update** with the matched detection. The update trusts the detection more when the predict uncertainty is high. This gives smooth trajectories and the ability to continue a track through a short occlusion (1-5 frames).

Every classical tracker uses a Kalman filter in the motion-prediction step.

### The Hungarian algorithm

Given a `M x N` cost matrix (tracks x detections), find the one-to-one assignment that minimises total cost. Cost is usually `1 - IoU(track_bbox, detection_bbox)` or negative cosine similarity of appearance features. Runtime is $O((M+N)^3)$; for $M, N$ up to ~1000 it is fast enough in Python via `scipy.optimize.linear_sum_assignment`.

### ByteTrack's key idea

Standard trackers drop low-confidence detections (< 0.5). ByteTrack keeps them around as **second-stage candidates**: after matching tracks to high-confidence detections, unmatched tracks try to match low-confidence detections with a slightly looser IoU threshold. Recovers short occlusions, ID switches near crowds.

### SAM 2 memory-based tracking

SAM 2 handles video by keeping a **memory bank** of per-instance spatio-temporal features. Given a prompt (click, box, or mask) on one frame, it encodes the instance into memory. On subsequent frames, the memory is cross-attended against the new frame's features, and the decoder produces a mask for the same instance in the new frame.

No Kalman filter, no Hungarian assignment. The association is implicit in the memory-attention operation.

Pros:
- Robust to large occlusions (memory carries instance identity across many frames).
- Open-vocabulary when combined with SAM 3's text prompts.
- Works without a separate motion model.

Cons:
- Slower than ByteTrack for many-object tracking.
- Memory bank grows; limits the context window.

### SAM 3.1 Object Multiplex

Prior SAM 2 / SAM 3 tracking keeps a separate memory bank per instance. For 50 objects, 50 memory banks. Object Multiplex (March 2026) collapses them into one shared memory with **per-instance query tokens**. Cost scales sub-linearly in number of instances.

Multiplex is the new default for crowd tracking in 2026: concert crowds, warehouse workers, traffic intersections.

### Three metrics to know

- **MOTA (Multi-Object Tracking Accuracy)** — 1 - (FN + FP + ID switches) / GT. Weighted by error type; a single metric that conflates detection and association failures.
- **IDF1 (ID F1)** — harmonic mean of ID precision and recall. Focuses specifically on how well each ground-truth track keeps its ID over time. Better than MOTA for ID-switch-sensitive tasks.
- **HOTA (Higher Order Tracking Accuracy)** — decomposes into detection accuracy (DetA) and association accuracy (AssA). The community standard since 2020; most comprehensive.

For surveillance (who is who): IDF1 is what you report. For sports analytics (counting passes): HOTA. For general academic comparison: HOTA.

## Build It

### Step 1: IoU-based cost matrix
```python
import numpy as np

def bbox_iou(a, b):
    """
    a, b: (N, 4) arrays of [x1, y1, x2, y2].
    Returns (N_a, N_b) IoU matrix.
    """
    ax1, ay1, ax2, ay2 = a[:, 0], a[:, 1], a[:, 2], a[:, 3]
    bx1, by1, bx2, by2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    inter_x1 = np.maximum(ax1[:, None], bx1[None, :])
    inter_y1 = np.maximum(ay1[:, None], by1[None, :])
    inter_x2 = np.minimum(ax2[:, None], bx2[None, :])
    inter_y2 = np.minimum(ay2[:, None], by2[None, :])
    inter = np.clip(inter_x2 - inter_x1, 0, None) * np.clip(inter_y2 - inter_y1, 0, None)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a[:, None] + area_b[None, :] - inter
    return inter / np.clip(union, 1e-8, None)
```
### Step 2: Minimal SORT-style tracker

Fixed constant-velocity Kalman omitted for brevity — we use a simple IoU association here; in production the Kalman predict is essential. The `sort` Python package provides the full version.
```python
from scipy.optimize import linear_sum_assignment

class Track:
    def __init__(self, tid, bbox, frame):
        self.id = tid
        self.bbox = bbox
        self.last_frame = frame
        self.hits = 1

    def update(self, bbox, frame):
        self.bbox = bbox
        self.last_frame = frame
        self.hits += 1

class SimpleTracker:
    def __init__(self, iou_threshold=0.3, max_age=5):
        self.tracks = []
        self.next_id = 1
        self.iou_threshold = iou_threshold
        self.max_age = max_age

    def step(self, detections, frame):
        if not self.tracks:
            for d in detections:
                self.tracks.append(Track(self.next_id, d, frame))
                self.next_id += 1
            return [(t.id, t.bbox) for t in self.tracks]

        track_boxes = np.array([t.bbox for t in self.tracks])
        det_boxes = np.array(detections) if len(detections) else np.empty((0, 4))

        iou = bbox_iou(track_boxes, det_boxes) if len(det_boxes) else np.zeros((len(track_boxes), 0))
        cost = 1 - iou
        cost[iou < self.iou_threshold] = 1e6

        matched_track = set()
        matched_det = set()
        if cost.size > 0:
            row, col = linear_sum_assignment(cost)
            for r, c in zip(row, col):
                if cost[r, c] < 1.0:
                    self.tracks[r].update(det_boxes[c], frame)
                    matched_track.add(r); matched_det.add(c)

        for i, d in enumerate(det_boxes):
            if i not in matched_det:
                self.tracks.append(Track(self.next_id, d, frame))
                self.next_id += 1

        self.tracks = [t for t in self.tracks if frame - t.last_frame <= self.max_age]
        return [(t.id, t.bbox) for t in self.tracks]
```
60 lines. Takes per-frame detections, returns per-frame track IDs. Real systems add the Kalman predict, ByteTrack's second-stage re-match, and appearance features.

### Step 3: Synthetic trajectory test
```python
def synthetic_frames(num_frames=20, num_objects=3, H=240, W=320, seed=0):
    rng = np.random.default_rng(seed)
    starts = rng.uniform(20, 200, size=(num_objects, 2))
    velocities = rng.uniform(-5, 5, size=(num_objects, 2))
    frames = []
    for f in range(num_frames):
        dets = []
        for i in range(num_objects):
            cx, cy = starts[i] + f * velocities[i]
            dets.append([cx - 10, cy - 10, cx + 10, cy + 10])
        frames.append(dets)
    return frames

tracker = SimpleTracker()
for f, dets in enumerate(synthetic_frames()):
    tracks = tracker.step(dets, f)
```
Three objects moving in straight lines should keep their IDs across all 20 frames.

### Step 4: ID-switch metric
```python
def count_id_switches(tracks_per_frame, gt_per_frame):
    """
    tracks_per_frame:  list of list of (track_id, bbox)
    gt_per_frame:      list of list of (gt_id, bbox)
    Returns number of ID switches.
    """
    prev_assignment = {}
    switches = 0
    for tracks, gts in zip(tracks_per_frame, gt_per_frame):
        if not tracks or not gts:
            continue
        t_boxes = np.array([b for _, b in tracks])
        g_boxes = np.array([b for _, b in gts])
        iou = bbox_iou(g_boxes, t_boxes)
        for g_idx, (gt_id, _) in enumerate(gts):
            j = iou[g_idx].argmax()
            if iou[g_idx, j] > 0.5:
                t_id = tracks[j][0]
                if gt_id in prev_assignment and prev_assignment[gt_id] != t_id:
                    switches += 1
                prev_assignment[gt_id] = t_id
    return switches
```
This is a simplified IDF1-adjacent metric: count how many times a ground-truth object changes its assigned predicted track ID. Real MOTA / IDF1 / HOTA tooling lives in `py-motmetrics` and `TrackEval`.

## Use It

Production trackers in 2026:

- `ultralytics` — YOLOv8 + ByteTrack / BoT-SORT built-in. `results = model.track(source, tracker="bytetrack.yaml")`. The default.
- `supervision` (Roboflow) — ByteTrack wrappers plus annotation utilities.
- SAM 2 / SAM 3.1 — memory-based tracking via `processor.track()`.
- Custom stack: detector (YOLOv8 / RT-DETR) + `sort-tracker` / `OC-SORT` / `StrongSORT`.

Picking:

- Pedestrians / cars / boxes at 30+ fps: **ByteTrack with ultralytics**.
- Many instances of one class in a crowd: **SAM 3.1 Object Multiplex**.
- Heavy occlusions with identifiable appearance: **DeepSORT / StrongSORT** (ReID features).
- Sports / complex interactions: **BoT-SORT** or learned trackers (MOTRv3).

## Ship It

This lesson produces:

- `outputs/prompt-tracker-picker.md` — picks SORT / ByteTrack / BoT-SORT / SAM 2 / SAM 3.1 given scene type, occlusion patterns, and latency budget.
- `outputs/skill-mot-evaluator.md` — writes a complete evaluation harness for MOTA / IDF1 / HOTA against ground-truth tracks.

Source: [AI Engineering from Scratch, phase 4, 27-multi-object-tracking](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/04-computer-vision/27-multi-object-tracking), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What does the Hungarian algorithm do in tracking-by-detection?
A: It solves the minimum-cost one-to-one assignment between tracks and detections — typically using 1 - IoU as cost — to match each track to at most one detection and vice versa. Every tracking-by-detection frame does an assignment problem: M tracks, N detections, find the best one-to-one match. Hungarian is the optimal polynomial algorithm for this. Cost is usually 1 - IoU (higher overlap = lower cost). scipy.optimize.linear_sum_assignment is the standard implementation. SORT, DeepSORT, ByteTrack, BoT-SORT all use it.
Q: ByteTrack's distinguishing contribution is what?
A: A second-stage association that tries to match leftover tracks to low-confidence detections, recovering short occlusions and IDs that standard trackers would lose by dropping those detections. Most trackers discard detections below a confidence threshold (~0.5). ByteTrack keeps them and runs a second Hungarian pass to try to match them to tracks that did not match any high-confidence detection. This recovers brief occlusions and crossings, lifting IDF1 significantly on MOT17 without any learned appearance features. Its simplicity makes it the default in Ultralytics and Roboflow Supervision.
Q: How does SAM 2's memory-based tracker avoid explicit Hungarian-style association?
A: It stores per-instance spatio-temporal features in a memory bank; on each new frame, cross-attention between memory and current features directly produces the mask of the same instance, with association implicit in the attention operation. SAM 2 replaces the detect-then-associate loop with a memory-conditional segmenter. The memory bank holds the instance's features from previous frames. At each new frame, the decoder cross-attends the new frame's features against the memory, and the resulting mask is the same instance — no external assignment step. This handles long occlusions gracefully because the memory stays even when the instance disappears for many frames.
Q: For surveillance video where keeping each person's ID consistent is the primary requirement, which metric should you report?
A: IDF1 — the harmonic mean of ID precision and recall; measures identity preservation over time rather than per-frame detection accuracy. MOTA conflates detection and association errors, so a tracker with many false positives can hide its ID failures. IDF1 is designed for the 'who is who over time' question: it matches predicted tracks to ground-truth tracks globally across the whole video and computes F1 on the identity labels. For surveillance and crowd analytics, IDF1 is the metric to report; HOTA is the broader academic standard.
Q: SAM 3.1 Object Multiplex (March 2026) introduces shared memory across many tracked instances. What does that enable?
A: Efficient multi-object tracking — one shared memory bank with per-instance query tokens replaces N separate memory banks, so cost scales sub-linearly in number of instances and concert-crowd-sized scenes become tractable. Pre-Multiplex SAM 2 / SAM 3 tracked each object with its own memory bank; cost scaled linearly with the number of instances. Multiplex (March 2026) introduces one shared memory with per-instance query tokens that fetch instance-specific features. Many-object tracking — crowds, traffic, warehouse workers — becomes efficient for the first time with a memory-based tracker.
```

===DEEPER===
## Exercises

1. **(Easy)** Run the synthetic tracker above with 3, 10, and 30 objects. Report ID-switch count in each case. Identify where the simple IoU-only association starts to fail.
2. **(Medium)** Add a constant-velocity Kalman predict step before association. Show that short (2-3 frame) occlusions no longer cause ID switches.
3. **(Hard)** Integrate SAM 2's memory-based tracker (via `transformers`) as an alternative tracker backend. Run both SimpleTracker and SAM 2 on a 30-second clip of a crowd and compare ID-switch counts, manually labelling ground-truth IDs for 5 salient people.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Tracking-by-detection | "Detect then associate" | Per-frame detector + Hungarian assignment on IoU / appearance |
| Kalman filter | "Motion predict" | Linear dynamics + covariance for smooth track predictions and occlusion handling |
| Hungarian algorithm | "Optimal assignment" | Solves the minimum-cost bipartite matching problem; `scipy.optimize.linear_sum_assignment` |
| ByteTrack | "Low-confidence second pass" | Re-match unmatched tracks to low-confidence detections to recover short occlusions |
| DeepSORT | "SORT + appearance" | Adds a ReID feature for cross-frame matching; better for ID preservation |
| Memory bank | "SAM 2 trick" | Per-instance spatio-temporal features stored across frames; cross-attention replaces explicit association |
| Object Multiplex | "SAM 3.1 shared memory" | Single shared memory with per-instance queries for fast many-object tracking |
| HOTA | "Modern tracking metric" | Decomposes into detection and association accuracy; community standard |

## Further Reading

- [SORT (Bewley et al., 2016)](https://arxiv.org/abs/1602.00763) — the minimal tracking-by-detection paper
- [DeepSORT (Wojke et al., 2017)](https://arxiv.org/abs/1703.07402) — adds appearance feature
- [ByteTrack (Zhang et al., 2022)](https://arxiv.org/abs/2110.06864) — low-confidence second pass
- [BoT-SORT (Aharon et al., 2022)](https://arxiv.org/abs/2206.14651) — camera motion compensation
- [HOTA (Luiten et al., 2020)](https://arxiv.org/abs/2009.07736) — decomposed tracking metric
- [SAM 2 video segmentation (Meta, 2024)](https://ai.meta.com/sam2/) — memory-based tracker
- [SAM 3.1 Object Multiplex (Meta, March 2026)](https://ai.meta.com/blog/segment-anything-model-3/)
