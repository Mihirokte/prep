---
id: lld-booking-locker
chapter: lld-concurrency-api
title: Booking & lockers: atomic allocation
minutes: 4
---
Two problems where concurrency is stated, not a bonus.

**BookMyShow / Movie Booking.** The single most important modeling decision: track seat availability **per showtime**, not per screen — the same physical seat is separately bookable for the 2pm and 6pm shows. Concurrency is a *hard requirement* here: two users booking the same seat, exactly one succeeds. Lock per-seat (or per-showtime) around check-and-reserve, and a multi-seat booking must be **all-or-nothing** — a partial booking on failure is an explicit test case. Design `cancel(confirmationId)` to be safe against double-cancel.

```steps
Sort | Order the requested seat ids by a global order to avoid deadlock when locking several
Acquire | Lock all requested seats, each in that fixed order
Check | Verify every seat is still free under the locks; if any is taken, abort
Reserve | Mark all seats reserved together, then release the locks
Rollback | On any failure reserve nothing, so the booking is all-or-nothing
```

**Amazon Locker.** Assignment is bin-packing-flavored: pick the *smallest* available locker that still fits the package (`findSmallestFit(size)`). Same check-and-assign lock as Parking Lot so two couriers don't get the same locker.

A useful contrast the Locker draws out: a **pickup code is not idempotent** — it must *invalidate after successful pickup*, so presenting it twice fails the second time. That's the opposite of a payment idempotency key, which *replays* the same result on retry. Same word ("has this been seen?"), opposite desired behavior — knowing which one a requirement wants is the signal.

```recall
Q: Why track movie seat availability per showtime rather than per screen?
A: The same physical seat is a separate bookable unit for the 2pm and 6pm shows. Keying availability by showtime lets both be reserved independently; keying by screen conflates them and makes correct booking impossible.
Q: Why must a multi-seat booking be all-or-nothing, and how do you avoid deadlock locking several seats?
A: A partial reserve on failure leaves the user with some seats and the system inconsistent, which is an explicit test case. Acquire all the seat locks in one fixed global order so two concurrent multi-seat bookings cannot form a circular wait.
Q: What is the Amazon Locker assignment rule, and why that rule?
A: findSmallestFit: assign the smallest available locker that still fits the package. It packs efficiently, leaving larger lockers free for larger packages, and the check-and-assign is locked so two couriers never get the same locker.
Q: Why is a pickup code the opposite of a payment idempotency key?
A: A pickup code must invalidate after the first successful use, so presenting it twice fails the second time. A payment key replays the same stored result on retry. Both answer "seen before?" but require opposite behavior, and recognizing which the requirement wants is the signal.
```
