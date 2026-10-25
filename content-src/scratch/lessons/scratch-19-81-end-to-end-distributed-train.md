---
id: scratch-19-81-end-to-end-distributed-train
chapter: scratch-19-capstone-projects
title: End-to-End Distributed Training
minutes: 0
---
> Lessons 76 through 80 each built one piece. This is the assembly: a tiny GPT trained across 4 simulated ranks with DDP for gradient sync, ZeRO-1 for optimiser-state sharding, and a sharded checkpoint at the halfway mark. The demo runs 20 steps, self-terminates, prints a loss curve plus a memory profile, and writes a resumable checkpoint.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 19 Track C lessons 42-49
**Time:** ~90 min

## Learning Objectives

- Compose DDP (lesson 77) plus ZeRO-1 (lesson 78) plus sharded checkpoints (lesson 80) into one training loop.
- Train a 2-layer transformer language model on a small synthetic corpus for 20 steps across 4 simulated ranks.
- Print a per-step loss table, a per-rank memory profile, and a checkpoint manifest that resumes byte-equal on the same world size.
- Defend the composition: each piece is independently testable in earlier lessons and this lesson proves they compose.

## The Problem

A capstone is the proof that the pieces fit together. Lesson 76 implemented collectives. Lesson 77 wrapped them into DDP. Lesson 78 sharded optimiser state with reduce_scatter. Lesson 79 analysed pipeline. Lesson 80 saved a sharded checkpoint. Each lesson stood alone with its own test. A real training run uses every primitive at once; if the composition is wrong, the loss diverges, the checkpoint refuses to resume, or the per-rank memory grows when it should shrink.

This lesson runs the end-to-end demo and verifies four invariants: (a) the loss decreases monotonically across the 20 steps within float noise, (b) every rank holds the same parameter norm at every step, (c) the per-rank optimiser memory equals the ZeRO-1 formula 12P/N bytes, and (d) the checkpoint at step 10 reloads byte-equal at restart. The demo self-terminates: 20 steps, single command, exit 0.

## The Concept
```flow
dir: TB
A: spawn 4 ranks | step
B: broadcast initial GPT params | model
C: for step in 20: forward + backward on... | step
D: ZeRO-1 step: reduce_scatter grads + A... | step
E: at step 10: save sharded checkpoint | step
F: continue to step 20 | step
G: memory profile + resume verify + exit 0 | store
A -> B
B -> C
C -> D
D -> E
E -> F
F -> G
```
### The mini GPT

The model is small on purpose: 2 transformer blocks, embed dim 32, 4 attention heads, vocab 64, sequence length 16, batch 4. A few thousand parameters. Big enough to exercise every wiring decision (multi-head attention runs the standard masked path; LayerNorm has weights to sync; the LM head is a separate linear projection back to the vocab). Small enough that 20 steps on 4 CPU ranks finish in seconds.

### The composition rules

| Lesson piece | What it owns | What it leaves to the loop |
|--------------|--------------|----------------------------|
| DDP broadcast | Initial parameter sync | One call at construct time |
| ZeRO-1 step | Gradient sync, master copy update, parameter broadcast | One call per step replacing optimiser.step |
| Sharded checkpoint | Persist per-rank state, manifest with sha256 | Called on rank 0 with state collected via allgather |
| Training loop | Forward, backward, loss logging | Calls the three above in order |

The loop does not know about reduce_scatter or rendezvous files. The ZeRO and checkpoint modules expose narrow interfaces that the loop composes.

### Why a tiny GPT and not just an MLP

The MLP from lesson 77 was sufficient to verify gradient sync. A tiny GPT adds three things: a separate LM head over the vocab (in this lesson, untied for clarity; full GPT typically ties the head to the token embedding), softmax+cross-entropy as the loss (more numerical edge cases than MSE), and an asymmetric forward (embeddings then attention then MLP per layer). Sticking with an MLP for the capstone would hide whether the composition handles LayerNorm or the embedding layer's grad shape correctly.

### Self-terminating means exit 0

The loop runs a fixed 20 steps and exits. No `while True`, no human intervention, no resume from external state. A capstone you can leave running unattended and find a complete log when it finishes is a capstone that proves the system is wired correctly. If any piece deadlocks the demo never returns and the test rig catches it.

## Build It

`code/main.py` implements:

- `MiniGPT`: 2-layer transformer with masked self-attention and a separate LM head.
- `make_corpus(seed, total_tokens)`: deterministic next-token-prediction data.
- `_train_worker`: spawned per rank; broadcasts init params, runs the loop, calls ZeRO step, writes the sharded checkpoint at step 10.
- `verify_resume`: after the main run, reloads the step-10 checkpoint in-process and asserts the saved master shards match the in-memory snapshot byte-for-byte.
- `main`: orchestrates the whole demo, prints the loss table, the memory profile, and the verification result.

Run it:
```bash
python3 code/main.py
```
Output: a 20-row loss table, a 4-row per-rank memory profile, a checkpoint manifest, and a "RESUME VERIFIED" line on success.

## Production patterns in the wild

Three patterns finish the composition for real runs.

**Checkpoint every K minutes, not every K steps.** Step time varies with seq length and microbatch count. A 10-minute checkpoint cadence catches the same compute regardless of model size. The lesson uses step-based for simplicity; production uses wall-clock-based.

**Detect divergence early.** Production runs add a NaN guard after backward and a loss-spike detector; if loss jumps by more than 2x in one step, roll back to the previous checkpoint instead of letting the optimiser march into a degenerate state. The lesson's loss curve is smooth so the guard is unused but the hook stays.

**Aggregate the memory profile across ranks.** Per-rank memory differs by rank in real runs (rank with the largest pipeline stage holds more activations). Production logs the max across ranks plus the mean; the lesson prints per-rank to show the formula matches.

## Use It

Production patterns:

- **DeepSpeed.** Combines DDP + ZeRO + pipeline + activation checkpointing under one config. The lesson's composition is the DeepSpeed shape in miniature.
- **PyTorch FSDP.** The native equivalent. `FullyShardedDataParallel` with `ShardingStrategy.SHARD_GRAD_OP` is ZeRO-2.
- **NeMo and Megatron-LM.** Add tensor parallel for the very largest models; otherwise the composition is the same shape.

## Ship It

The full track ends here. The 6 lessons together are the distributed-training subsystem a real team would build before adopting DeepSpeed; the abstraction has been proven against gloo and the failure modes have been exercised. Phase 17 (infrastructure and production) is the place to take this to a real cluster.

Source: [AI Engineering from Scratch, phase 19, 81-end-to-end-distributed-train](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/19-capstone-projects/81-end-to-end-distributed-train), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why does a capstone matter when each lesson already had its own tests?
A: Composition is a separate property: pieces can pass unit tests but the integration deadlocks, the loss diverges, or the memory grows when they run together. End-to-end tests catch wiring bugs that no piece tests in isolation: rendezvous, barrier order, gather contracts.
Q: What four invariants does the demo verify?
A: (a) loss runs to step 20 without NaN, (b) every rank's parameter norm agrees, (c) per-rank optimiser memory equals the ZeRO-1 formula, (d) the step-10 checkpoint reloads byte-equal. Each invariant catches a different composition bug: NaN catches divergence, norm-agree catches sync drift, memory catches sharding bugs, checkpoint catches write atomicity.
Q: Why is the model a tiny GPT instead of an MLP?
A: GPT adds LayerNorm running statistics, embedding gradient shape, and softmax+cross-entropy edge cases that an MLP would hide. MLP gradient sync was verified in lesson 77; the capstone needs a model with more edge cases to prove composition under realistic ops.
Q: What does self-terminating mean in this context?
A: Fixed step count (20), exit 0 on completion, no human in the loop; if any piece deadlocks the demo never returns and CI catches it. A bounded run with exit 0 lets the test rig assert termination; while-True loops mask deadlocks.
Q: How does the demo combine DDP and ZeRO?
A: DDP-style broadcast at init for parameter sync, ZeRO-1's reduce_scatter+allgather replaces optimiser.step; DDP gradient allreduce is subsumed into ZeRO's reduce_scatter. ZeRO-1 owns the gradient sync via reduce_scatter, so DDP's separate allreduce is not needed; the broadcast at init is the only DDP-specific call that survives.
Q: Why does production use wall-clock checkpoint cadence instead of step count?
A: Step time varies with sequence length and microbatch count; a 10-minute cadence catches the same compute regardless of model size. The lesson uses step-based for clarity; production runs typically save every 5-15 minutes of wall-clock.
```

===DEEPER===
## Exercises

1. Add a tensor-parallel split of the attention head and verify the loss matches the single-rank baseline. Two ranks: half the heads per rank, allreduce of the attention output.
2. Add gradient accumulation across 4 microbatches and prove the gradient equals the gradient of one big batch.
3. Add a resume-from-step-10 path that actually continues training to step 20 and produces the same final loss as the original run.
4. Add a metrics export (loss, grad norm, step time) to JSONL so the run can be visualised after the fact.
5. Add a NaN guard that rolls back to the previous checkpoint on a loss spike, and force a spike with a one-step LR multiplier to exercise the rollback.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|------------------------|
| End-to-end | "Wire it all up" | One run composes every piece, not a unit test per piece |
| Memory profile | "GB per rank" | Bytes held on each rank for params, grads, optimiser state |
| Resume contract | "Save and load" | Per-rank state byte-equal after a checkpoint round-trip |
| Self-terminating | "Bounded run" | Fixed step count, exit 0 on completion, no human in the loop |

## Further Reading

- [DeepSpeed end-to-end training tutorial](https://www.deepspeed.ai/getting-started/)
- [PyTorch FSDP advanced tutorial](https://pytorch.org/tutorials/intermediate/FSDP_advanced_tutorial.html)
- [Megatron-LM training script reference](https://github.com/NVIDIA/Megatron-LM)
- Phase 19 Lessons 76-80 - each piece this lesson composes
- Phase 17 - moving the composition to a real cluster
