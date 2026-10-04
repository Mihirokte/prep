---
id: lld-concurrency-types
chapter: lld-concurrency-api
title: Three kinds of concurrency problem
minutes: 4
---
LLD concurrency is single-process, shared-memory, multi-threaded — threads racing over an in-memory object (a `Seat`, a `ParkingSpot`, a counter). It's *not* distributed-systems concurrency; if an interviewer asks "and across multiple machines?", name that as a system-design pivot.

Recognising which of three types you face tells you which primitive to reach for:

| Type | What breaks | Fix |
|---|---|---|
| **Correctness** | shared state corrupted by concurrent read-modify-write | locks, atomics, immutability |
| **Coordination** | threads must hand off work or wait on each other | blocking queues, condition variables |
| **Scarcity** | a limited resource is contended | semaphores, resource pools |

Most problems *start* as Correctness and grow Coordination/Scarcity as follow-ups.

The classic Correctness bug is **check-then-act**: "check if the seat is free" then "book it" as two separate steps lets two threads both pass the check before either acts. The fix is making check-and-act *one* atomic operation under a single lock — not two separate locked operations. This exact shape recurs in Parking Lot, Movie Booking, Amazon Locker, and Library ("two members borrow the last copy").

```flow
dir: LR
t1: Thread 1 | actor
t2: Thread 2 | actor
check: Seat free? | gate
book: Book seat | step
t1 -> check : reads free
t2 -> check : reads free
check -> book : both pass
t1 -> book : books it
t2 -> book : double-books
```

```recall
Q: What are the three kinds of LLD concurrency problem, and the primitive each points to?
A: Correctness (shared state corrupted by concurrent read-modify-write) -> locks, atomics, or immutability. Coordination (threads must hand off or wait) -> blocking queues or condition variables. Scarcity (a limited resource is contended) -> semaphores or resource pools.
Q: Why does the check-then-act pattern double-book a seat, and what is the fix?
A: Checking "is the seat free" and then booking it as two steps lets two threads both pass the check before either books. The fix is making check-and-act one atomic operation under a single lock, not two separately locked operations.
Q: How is LLD concurrency different from distributed-systems concurrency?
A: LLD concurrency is single-process, shared-memory, multi-threaded (threads racing over an in-memory object). Coordinating across multiple machines is a system-design concern; name that pivot if the interviewer asks about it rather than answering with locks.
```
