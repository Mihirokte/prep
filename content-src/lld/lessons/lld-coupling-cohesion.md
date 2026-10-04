---
id: lld-coupling-cohesion
chapter: lld-principles
title: Coupling, cohesion, and modeling the right entities
minutes: 4
---
Every principle so far serves one goal: **maximise cohesion inside each class, minimise coupling between classes.**

- **Cohesion** — how tightly a class's own responsibilities belong together. High cohesion = SRP satisfied. A `PDFPrinter` that only formats PDF is high-cohesion.
- **Coupling** — how much one class leans on another's internals. Low coupling = classes talk through narrow, stable interfaces. Depending on a `MessageSender` interface is loose; depending on a concrete `EmailSender` is tight.

A related trap the **Law of Demeter** catches: don't reach through objects — `order.getCustomer().getAddress().getZipCode()` couples you to three objects' structure. Add `order.getCustomerZipCode()` and let `Order` navigate internally. (Fluent builder chains are fine — each call returns the *same* type.)

The other half of good modeling is picking the right *entities*. The classic tell is the **Library** problem: model only `Book` with a boolean `available` and you can't represent owning five copies of a title. Split `Book` (catalog entry) from `BookCopy` (a lending unit) — "is this book available" really means "is at least one copy available". Getting that split right is worth more than any pattern.

```flow
dir: LR
book: Book (catalog) | store
copy: BookCopy (unit) | store
member: Member | actor
book -> copy : has many
member -> copy : borrows one
copy -> book : available if any free
```

```recall
Q: What is the difference between coupling and cohesion, and which direction do you want each?
A: Cohesion is how tightly a class's own responsibilities belong together (you want it high, which is SRP satisfied). Coupling is how much one class leans on another's internals (you want it low, achieved by talking through narrow stable interfaces).
Q: Why does depending on a MessageSender interface beat depending on a concrete EmailSender?
A: The interface is a narrow stable contract, so swapping email for SMS or injecting a test double changes nothing in the dependent class. Depending on the concrete class ties you to its internals and forces edits when it changes.
Q: What breaks if you model a library as a single Book class with an available flag?
A: You cannot represent owning several copies of one title, so you cannot lend copy two while copy one is out. Splitting Book (catalog entry) from BookCopy (lending unit) fixes it: availability becomes "at least one copy is free".
Q: What does the Law of Demeter catch, and when is a chained call still fine?
A: It catches reaching through objects (order.getCustomer().getAddress().getZipCode()), which couples you to three objects' structure; add order.getCustomerZipCode() instead. A fluent builder chain is fine because each call returns the same type rather than exposing a different object's internals.
```
