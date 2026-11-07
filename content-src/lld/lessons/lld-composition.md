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

```check
Q: You are designing an e-commerce platform where a customer's discount calculation changes dynamically based on promotional campaigns and loyalty points. Following the principle of composition over inheritance, how should this be modeled?
- Subclass Customer into RegularCustomer, SilverCustomer, GoldCustomer, and VIPCustomer, each overriding discount calculations.
- Create deep inheritance chains like PercentageDiscountCustomer extending TieredCustomer.
* Have Customer hold a reference to a DiscountStrategy that can be swapped when customer tiers change.
- Avoid interfaces and implement all discount calculations with conditional branching inside Customer.
Why: Discount calculation is a behavior that can change at runtime rather than a customer's permanent identity, making Strategy (composition) the appropriate pattern. Subclassing Customer based on discounts locks behavior at compile time and creates rigid inheritance hierarchies. Using a single class with complex branching avoids composition and becomes difficult to maintain.
```

```recall
Q: What is the decision rule for composition over inheritance?
A: Use composition (has-a) when the thing that varies is behavior you may swap at runtime; use inheritance (is-a) when the variation is tied to the object's permanent identity and every subtype is substitutable everywhere the base is used.
Q: Why are chess pieces correct inheritance but a payment method is not?
A: A piece's move rule is fixed by what the piece permanently is and every piece honors the same move contract (LSP holds), so subclassing fits. A payment method is behavior you choose and swap at runtime, so holding a strategy reference beats baking it into a hierarchy.
Q: What breaks when you subclass a subclass to vary behavior?
A: Deep hierarchies lock behavior to type at compile time, so combining variations means a class per combination and changing one axis forces edits across the tree. Composition flattens this: hold a behavior object and swap it, so the number of classes grows additively, not multiplicatively.
```
