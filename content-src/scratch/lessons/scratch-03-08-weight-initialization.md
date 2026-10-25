---
id: scratch-03-08-weight-initialization
chapter: scratch-03-deep-learning-core
title: Weight Initialization and Training Stability
minutes: 0
---
> Initialize wrong and training never starts. Initialize right and 50 layers train as smoothly as 3.

**Type:** Build
**Languages:** Python
**Prerequisites:** Lesson 03.04 (Activation Functions), Lesson 03.07 (Regularization)
**Time:** ~90 minutes

## Learning Objectives

- Implement zero, random, Xavier/Glorot, and Kaiming/He initialization strategies and measure their effect on activation magnitudes through 50 layers
- Derive why Xavier init uses Var(w) = 2/(fan_in + fan_out) and Kaiming uses Var(w) = 2/fan_in
- Demonstrate the symmetry problem with zero initialization and explain why random scale alone is insufficient
- Match the correct initialization strategy to the activation function: Xavier for sigmoid/tanh, Kaiming for ReLU/GELU

## The Problem

Initialize all weights to zero. Nothing learns. Every neuron computes the same function, receives the same gradient, and updates identically. After 10,000 epochs, your 512-neuron hidden layer is still 512 copies of the same neuron. You paid for 512 parameters and got 1.

Initialize them too large. Activations explode through the network. By layer 10, values hit 1e15. By layer 20, they overflow to infinity. Gradients follow the same trajectory in reverse.

Initialize them randomly from a standard normal distribution. Works for 3 layers. At 50 layers, the signal collapses to zero or detonates to infinity depending on whether the random scale was slightly too small or slightly too large. The boundary between "works" and "broken" is razor-thin.

Weight initialization is the most underrated decision in deep learning. Architecture gets papers. Optimizers get blog posts. Initialization gets a footnote. But get it wrong and nothing else matters -- your network is dead before training begins.

## The Concept

### The Symmetry Problem

Every neuron in a layer has the same structure: multiply inputs by weights, add bias, apply activation. If all weights start at the same value (zero is the extreme case), every neuron computes the same output. During backpropagation, every neuron receives the same gradient. During the update step, every neuron changes by the same amount.

You're stuck. The network has hundreds of parameters, but they all move in lockstep. This is called symmetry, and random initialization is the brute-force way to break it. Each neuron starts at a different point in weight space, so each learns a different feature.

But "random" is not enough. The *scale* of the randomness determines whether the network trains.

### Variance Propagation Through Layers

Consider a single layer with fan_in inputs:
```math
z = w_1 x_1 + w_2 x_2 + \cdots + w_n x_n
```
If each weight $w_i$ is drawn from a distribution with variance $\mathrm{Var}(w)$ and each input $x_i$ has variance $\mathrm{Var}(x)$, the output variance is:
```math
\mathrm{Var}(z) = \text{fan}_{\text{in}} \cdot \mathrm{Var}(w) \cdot \mathrm{Var}(x)
```
If $\mathrm{Var}(w) = 1$ and $\text{fan}_{\text{in}} = 512$, the output variance is 512x the input variance. After 10 layers: $512^{10} = 1.2 \times 10^{27}$. Your signal has exploded.

If $\mathrm{Var}(w) = 0.001$, the output variance shrinks by $0.001 \cdot 512 = 0.512$ per layer. After 10 layers: $0.512^{10} = 0.00013$. Your signal has vanished.

The goal: choose $\mathrm{Var}(w)$ so that $\mathrm{Var}(z) = \mathrm{Var}(x)$. Signal magnitude stays constant across layers.

### Xavier/Glorot Initialization

Glorot and Bengio (2010) derived the solution for sigmoid and tanh activations. To keep variance constant in both the forward and backward pass:
```math
\mathrm{Var}(w) = \frac{2}{\text{fan}_{\text{in}} + \text{fan}_{\text{out}}}
```
In practice, weights are drawn from:
```math
w \sim \text{Uniform}(-\text{limit}, \text{limit}) \quad \text{where } \text{limit} = \sqrt{\frac{6}{\text{fan}_{\text{in}} + \text{fan}_{\text{out}}}}
```
or:
```math
w \sim \text{Normal}\left(0, \sqrt{\frac{2}{\text{fan}_{\text{in}} + \text{fan}_{\text{out}}}}\right)
```
This works because sigmoid and tanh are roughly linear near zero, where properly initialized activations live. The variance stays stable through dozens of layers.

### Kaiming/He Initialization

ReLU kills half the outputs (everything negative becomes zero). The effective fan_in is halved because on average half the inputs are zeroed. Xavier init doesn't account for this -- it underestimates the variance needed.

He et al. (2015) adjusted the formula:
```math
\mathrm{Var}(w) = \frac{2}{\text{fan}_{\text{in}}}
```
Weights are drawn from:
```math
w \sim \text{Normal}\left(0, \sqrt{\frac{2}{\text{fan}_{\text{in}}}}\right)
```
The factor of 2 compensates for ReLU zeroing half the activations. Without it, the signal shrinks by ~0.5x per layer. With 50 layers: $0.5^{50} = 8.8 \times 10^{-16}$. Kaiming init prevents this.

### Transformer Initialization

GPT-2 introduced a different pattern. Residual connections add the output of each sub-layer to its input:
```math
x = x + \text{sublayer}(x)
```
Each addition increases variance. With $N$ residual layers, variance grows proportionally to $N$. GPT-2 scales the weights of residual layers by $1/\sqrt{2N}$, where $N$ is the number of layers. This keeps the accumulated signal magnitude stable.

Llama 3 (405B parameters, 126 layers) uses a similar scheme. Without this scaling, the residual stream would grow unbounded through 126 layers of attention and feedforward blocks.
```flow
dir: TB
Z1: Layer 1 All weights = 0 | step
Z2: Layer 2 All neurons identical | step
Z3: Layer 3 Still identical | step
ZR: Result: 1 effective neuron regardless... | step
X1: Layer 1 Var = 2/(fan_in+fan_out) | step
X2: Layer 2 Signal stable | step
X3: Layer 50 Signal stable | step
XR: Result: Trains with sigmoid/tanh | step
K1: Layer 1 Var = 2/fan_in | step
K2: Layer 2 Signal stable | step
K3: Layer 50 Signal stable | step
KR: Result: Trains with ReLU/GELU | step
Z1 -> Z2
Z2 -> Z3
Z3 -> ZR
X1 -> X2
X2 -> X3
X3 -> XR
K1 -> K2
K2 -> K3
K3 -> KR
```
### Activation Magnitude Through 50 Layers
```flow
dir: LR
L1: Layer 1 | step
L10: Layer 10 | step
L25: Layer 25 | step
L50: Layer 50 | step
L1 -> L10
L10 -> L25
L25 -> L50
```
### Choosing the Right Init
```flow
dir: TB
Start: What activation? | step
Act: Activation type? | gate
Xavier: Xavier/Glorot Var = 2/(fan_in + fan_out) | step
Kaiming: Kaiming/He Var = 2/fan_in | step
Kaiming2: Kaiming/He (same as ReLU) | step
GPT: Scale by 1/sqrt(2N) N = num layers | step
Check: Verify: activation magnitudes stay be... | step
Start -> Act
Act -> Xavier : Sigmoid / Tanh
Act -> Kaiming : ReLU / Leaky ReLU
Act -> Kaiming2 : GELU / Swish
Act -> GPT : Transformer residual
Xavier -> Check
Kaiming -> Check
Kaiming2 -> Check
GPT -> Check
```

## Build It

### Step 1: Initialization Strategies

Four ways to initialize a weight matrix. Each returns a list of lists (a 2D matrix) with fan_in columns and fan_out rows.
```python
import math
import random

def zero_init(fan_in, fan_out):
    return [[0.0 for _ in range(fan_in)] for _ in range(fan_out)]

def random_init(fan_in, fan_out, scale=1.0):
    return [[random.gauss(0, scale) for _ in range(fan_in)] for _ in range(fan_out)]

def xavier_init(fan_in, fan_out):
    std = math.sqrt(2.0 / (fan_in + fan_out))
    return [[random.gauss(0, std) for _ in range(fan_in)] for _ in range(fan_out)]

def kaiming_init(fan_in, fan_out):
    std = math.sqrt(2.0 / fan_in)
    return [[random.gauss(0, std) for _ in range(fan_in)] for _ in range(fan_out)]
```
### Step 2: Activation Functions

We need sigmoid, tanh, and ReLU to test each init strategy with its intended activation.
```python
def sigmoid(x):
    x = max(-500, min(500, x))
    return 1.0 / (1.0 + math.exp(-x))

def tanh_act(x):
    return math.tanh(x)

def relu(x):
    return max(0.0, x)
```
### Step 3: Forward Pass Through 50 Layers

Pass random data through a deep network and measure mean activation magnitude at each layer.
```python
def forward_deep(init_fn, activation_fn, n_layers=50, width=64, n_samples=100):
    random.seed(42)
    layer_magnitudes = []

    inputs = [[random.gauss(0, 1) for _ in range(width)] for _ in range(n_samples)]

    for layer_idx in range(n_layers):
        weights = init_fn(width, width)
        biases = [0.0] * width

        new_inputs = []
        for sample in inputs:
            output = []
            for neuron_idx in range(width):
                z = sum(weights[neuron_idx][j] * sample[j] for j in range(width)) + biases[neuron_idx]
                output.append(activation_fn(z))
            new_inputs.append(output)
        inputs = new_inputs

        magnitudes = []
        for sample in inputs:
            magnitudes.append(sum(abs(v) for v in sample) / width)
        mean_mag = sum(magnitudes) / len(magnitudes)
        layer_magnitudes.append(mean_mag)

    return layer_magnitudes
```
### Step 4: The Experiment

Run all combinations: zero init, random N(0,1), random N(0,0.01), Xavier with sigmoid, Xavier with tanh, Kaiming with ReLU. Print the magnitude at key layers.
```python
def run_experiment():
    configs = [
        ("Zero init + Sigmoid", lambda fi, fo: zero_init(fi, fo), sigmoid),
        ("Random N(0,1) + ReLU", lambda fi, fo: random_init(fi, fo, 1.0), relu),
        ("Random N(0,0.01) + ReLU", lambda fi, fo: random_init(fi, fo, 0.01), relu),
        ("Xavier + Sigmoid", xavier_init, sigmoid),
        ("Xavier + Tanh", xavier_init, tanh_act),
        ("Kaiming + ReLU", kaiming_init, relu),
    ]

    print(f"{'Strategy':<30} {'L1':>10} {'L5':>10} {'L10':>10} {'L25':>10} {'L50':>10}")
    print("-" * 80)

    for name, init_fn, act_fn in configs:
        mags = forward_deep(init_fn, act_fn)
        row = f"{name:<30}"
        for idx in [0, 4, 9, 24, 49]:
            val = mags[idx]
            if val > 1e6:
                row += f" {'EXPLODED':>10}"
            elif val < 1e-6:
                row += f" {'VANISHED':>10}"
            else:
                row += f" {val:>10.4f}"
        print(row)
```
### Step 5: Symmetry Demonstration

Show that zero init produces identical neurons.
```python
def symmetry_demo():
    random.seed(42)
    weights = zero_init(2, 4)
    biases = [0.0] * 4

    inputs = [0.5, -0.3]
    outputs = []
    for neuron_idx in range(4):
        z = sum(weights[neuron_idx][j] * inputs[j] for j in range(2)) + biases[neuron_idx]
        outputs.append(sigmoid(z))

    print("\nSymmetry Demo (4 neurons, zero init):")
    for i, out in enumerate(outputs):
        print(f"  Neuron {i}: output = {out:.6f}")
    all_same = all(abs(outputs[i] - outputs[0]) < 1e-10 for i in range(len(outputs)))
    print(f"  All identical: {all_same}")
    print(f"  Effective parameters: 1 (not {len(weights) * len(weights[0])})")
```
### Step 6: Layer-by-Layer Magnitude Report

Print a visual bar chart of activation magnitudes through 50 layers.
```python
def magnitude_report(name, magnitudes):
    print(f"\n{name}:")
    for i, mag in enumerate(magnitudes):
        if i % 5 == 0 or i == len(magnitudes) - 1:
            if mag > 1e6:
                bar = "X" * 50 + " EXPLODED"
            elif mag < 1e-6:
                bar = "." + " VANISHED"
            else:
                bar_len = min(50, max(1, int(mag * 10)))
                bar = "#" * bar_len
            print(f"  Layer {i+1:3d}: {bar} ({mag:.6f})")
```

## Use It

PyTorch provides these as built-in functions:
```python
import torch
import torch.nn as nn

layer = nn.Linear(512, 256)

nn.init.xavier_uniform_(layer.weight)
nn.init.xavier_normal_(layer.weight)

nn.init.kaiming_uniform_(layer.weight, nonlinearity='relu')
nn.init.kaiming_normal_(layer.weight, nonlinearity='relu')

nn.init.zeros_(layer.bias)
```
When you call `nn.Linear(512, 256)`, PyTorch defaults to Kaiming uniform initialization. That's why most simple networks "just work" -- PyTorch already made the right choice. But when you build custom architectures or go deeper than 20 layers, you need to understand what's happening and potentially override the default.

For transformers, HuggingFace models typically handle initialization in their `_init_weights` method. GPT-2's implementation scales residual projections by $1/\sqrt{N}$. If you're building a transformer from scratch, you need to add this yourself.

## Ship It

This lesson produces:
- `outputs/prompt-init-strategy.md` -- a prompt that diagnoses weight initialization problems and recommends the right strategy

Source: [AI Engineering from Scratch, phase 3, 08-weight-initialization](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/03-deep-learning-core/08-weight-initialization), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What happens if you initialize all weights in a neural network to zero?
A: All neurons compute identical outputs and receive identical gradients, so the network has only 1 effective neuron per layer. With zero weights, every neuron in a layer computes the same function, receives the same gradient, and updates identically. This 'symmetry' means hundreds of parameters behave as one.
Q: Why does the scale of random weight initialization matter?
A: If variance is too high, activations explode; if too low, activations vanish -- both prevent training. Each layer multiplies variance by fan_in * Var(w). If this product is > 1, signal explodes exponentially through layers. If < 1, it vanishes. Proper initialization keeps this product at exactly 1.
Q: What is the formula for Kaiming/He initialization variance?
A: Var(w) = 2/fan_in. Kaiming init uses Var(w) = 2/fan_in. The factor of 2 compensates for ReLU zeroing half the activations (negative values become 0), which effectively halves the fan_in.
Q: When should you use Xavier/Glorot initialization instead of Kaiming/He?
A: When using sigmoid or tanh activations, which don't zero half the outputs like ReLU. Xavier init uses Var(w) = 2/(fan_in + fan_out), designed for activations that are roughly linear near zero (sigmoid, tanh). Kaiming's extra factor of 2 compensates for ReLU's half-zeroing, which Xavier doesn't need.
Q: Why does GPT-2 scale residual layer weights by 1/sqrt(2N)?
A: Each residual addition increases variance, so scaling prevents the accumulated signal from growing unbounded through N layers. Residual connections add sublayer output to the input: x = x + sublayer(x). Each addition increases variance. With N residual layers, variance grows proportionally to N. Scaling by 1/sqrt(2N) keeps the signal stable.
```

===DEEPER===
## Exercises

1. Add LeCun initialization ($\mathrm{Var} = 1/\text{fan}_{\text{in}}$, designed for SELU activation). Run the 50-layer experiment with LeCun init + tanh and compare to Xavier + tanh.

2. Implement the GPT-2 residual scaling: multiply the output of each layer by $1/\sqrt{2N}$ before adding to the residual stream. Run 50 layers with and without scaling, measure how fast the residual magnitude grows.

3. Create an "init health check" function that takes a network's layer dimensions and activation type, then recommends the correct initialization and warns if the current init will cause problems.

4. Run the experiment with $\text{fan} _{\text{in}} = 16$ vs $\text{fan} _{\text{in}} = 1024$. Xavier and Kaiming adapt to fan_in, but random init doesn't. Show how the gap between "works" and "breaks" widens with larger layers.

5. Implement orthogonal initialization (generate a random matrix, compute its SVD, use the orthogonal matrix U). Compare to Kaiming for ReLU networks at 50 layers.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Weight initialization | "Set starting weights randomly" | The strategy for choosing initial weight values that determines whether a network can train at all |
| Symmetry breaking | "Make neurons different" | Using random initialization to ensure neurons learn distinct features instead of computing identical functions |
| Fan-in | "Number of inputs to a neuron" | The number of incoming connections, which determines how input variance accumulates in the weighted sum |
| Fan-out | "Number of outputs from a neuron" | The number of outgoing connections, relevant for maintaining gradient variance during backpropagation |
| Xavier/Glorot init | "The sigmoid initialization" | $\mathrm{Var}(w) = 2/(\text{fan} _{\text{in}} + \text{fan} _{\text{out}})$, designed to preserve variance through sigmoid and tanh activations |
| Kaiming/He init | "The ReLU initialization" | $\mathrm{Var}(w) = 2/\text{fan}_{\text{in}}$, accounts for ReLU zeroing half the activations |
| Variance propagation | "How signals grow or shrink through layers" | The mathematical analysis of how activation variance changes layer by layer based on weight scale |
| Residual scaling | "GPT-2's init trick" | Scaling residual connection weights by $1/\sqrt{2N}$ to prevent variance growth through $N$ transformer layers |
| Dead network | "Nothing trains" | A network where poor initialization causes all gradients to be zero or all activations to saturate |
| Exploding activations | "Values go to infinity" | When weight variance is too high, causing activation magnitudes to grow exponentially through layers |

## Further Reading

- Glorot & Bengio, "Understanding the difficulty of training deep feedforward neural networks" (2010) -- the original Xavier initialization paper with variance analysis
- He et al., "Delving Deep into Rectifiers" (2015) -- introduced Kaiming initialization for ReLU networks
- Radford et al., "Language Models are Unsupervised Multitask Learners" (2019) -- GPT-2 paper with residual scaling initialization
- Mishkin & Matas, "All You Need is a Good Init" (2016) -- layer-sequential unit-variance initialization, an empirical alternative to analytical formulas
