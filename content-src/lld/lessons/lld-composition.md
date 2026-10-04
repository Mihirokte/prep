---
id: lld-composition
chapter: lld-principles
title: Composition over inheritance
minutes: 3
---
Prefer "has-a" (a class holds a reference to a behavior object) over "is-a" (deep subclass hierarchies) when the thing that varies is *behavior*, not *identity*.

The Strategy pattern is composition-over-inheritance in its purest interview form. Instead of a hierarchy — `CreditCardPaymentProcessor extends PaymentProcessor extends AbstractPaymentProcessor` — you hold a `PaymentStrategy` reference and swap it at runtime.

Inheritance hierarchies deeper than one level are a common LLD red flag. If you find yourself subclassing a subclass, ask whether composition would flatten it.

```flow
dir: LR
vary: What varies | gate
isa: Identity (is-a) | step
hasa: Behavior (has-a) | step
inherit: Subclass it | step
compose: Hold + swap ref | step
vary -> isa : fixed type
vary -> hasa : runtime choice
isa -> inherit
hasa -> compose
```

The exception that proves the rule: **Chess pieces**. `Pawn`, `Rook`, `Bishop` each override `getValidMoves(board, position)`. That *is* correct inheritance — the variation is tied to the piece's permanent identity and every subtype is substitutable (satisfies LSP), so it's not a Strategy you swap at runtime. Use inheritance when the difference is *what a thing is*; use composition when the difference is *what a thing does right now*.

```recall
Q: What is the decision rule for composition over inheritance?
A: Use composition (has-a) when the thing that varies is behavior you may swap at runtime; use inheritance (is-a) when the variation is tied to the object's permanent identity and every subtype is substitutable everywhere the base is used.
Q: Why are chess pieces correct inheritance but a payment method is not?
A: A piece's move rule is fixed by what the piece permanently is and every piece honors the same move contract (LSP holds), so subclassing fits. A payment method is behavior you choose and swap at runtime, so holding a strategy reference beats baking it into a hierarchy.
Q: What breaks when you subclass a subclass to vary behavior?
A: Deep hierarchies lock behavior to type at compile time, so combining variations means a class per combination and changing one axis forces edits across the tree. Composition flattens this: hold a behavior object and swap it, so the number of classes grows additively, not multiplicatively.
```
