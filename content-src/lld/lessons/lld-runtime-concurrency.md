---
id: lld-runtime-concurrency
chapter: lld-concurrency-api
title: Processes threads and event loops
minutes: 3
---
Concurrency designs fail when the runtime model is hand-waved. A process, a thread, an asynchronous task, and an event-loop callback are not interchangeable. The right primitive depends on whether work waits, computes, shares memory, and needs isolation.

## Four execution models

A process has its own address space. It gives strong isolation but makes communication and startup more expensive. Threads share process memory, so communication is cheap and races are possible. An async task is a language or runtime abstraction that pauses at await points. An event loop runs callbacks on one main thread and relies on operations yielding quickly.

```flow
dir: LR
request: Incoming work | actor
loop: Event loop | step
io: Async I O | tool
pool: Worker pool | step
cpu: CPU heavy work | step
request -> loop
loop -> io : wait without blocking
io --> loop : completion
loop -> pool : offload
pool -> cpu
cpu --> loop : result
```

Async does not mean parallel. An async handler that parses a huge document still occupies the event-loop thread until it yields. During that time, completed network calls cannot run their callbacks. Move sustained CPU work to worker threads or processes, and bound the queue feeding them.

## Shared state creates races

A race is not two threads running at once; it is an outcome that depends on their interleaving. `if stock > 0: stock -= 1` is unsafe because the read and write are separate. Two workers can both observe one unit and both sell it.

Protect the invariant with one atomic boundary: a lock around the whole transition, a database transaction, or a compare-and-set on a versioned value. Locking only the final assignment is insufficient. Keep critical sections short and never perform a slow external call while holding a local lock.

```steps
Name the invariant | Say exactly what must never become false
List shared state | Find every value participating in that invariant
Choose one boundary | Lock transact or compare and set the whole transition
Move slow work out | Release ownership before network or callback execution
Test the race | Force the conflicting operations to overlap
```

## Backpressure completes the design

Offloading work without a queue limit only moves the failure. If arrivals exceed service rate, latency and memory grow until the process fails. Bound the queue, reject or shed work deliberately, and expose queue depth and wait time. A healthy system has an overload behavior, not only a normal behavior.

## Interview decision rule

Use async I/O for many waiting operations, threads when shared-memory parallelism is useful and the runtime allows it, and processes for stronger isolation or CPU-heavy parallelism. Then state the cost: synchronization for threads, serialization for processes, and event-loop stalls for unbounded CPU work.

```recall
Q: Why can an async function still block an event loop?
A: CPU work runs until it yields; async syntax only makes waits cooperative, so a long computation can still prevent every other callback from running.
Q: What exactly must a lock protect?
A: The complete state transition that preserves the invariant, including its read and write, not only the final assignment.
Q: Why must a worker queue be bounded?
A: When arrival rate exceeds service rate, an unbounded queue converts overload into growing latency and memory until the process fails.
Q: When is a process preferable to a thread?
A: When isolation or independent failure matters, or when CPU parallelism is needed and shared memory is unnecessary or unsafe.
```
