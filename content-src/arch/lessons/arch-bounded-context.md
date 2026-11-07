---
id: arch-bounded-context
chapter: arch-ddd
title: Bounded contexts
minutes: 4
---
A bounded context is an explicit boundary within which a domain model — its objects, rules, and vocabulary — is internally consistent. Outside that boundary, the same word can mean something genuinely different.

Fowler's example: at a utility company, "meter" meant subtly different things in different parts of the org — the grid-to-location connection, the grid-to-customer connection, or the physical device. These are **polysemes**: the same word, genuinely different concepts. DDD's answer is *not* to force one canonical definition; it is to give each context its own precise model and map explicitly between them.

**Why it matters practically:** this is the DDD concept that maps most directly onto "where do I put the service/module boundary." A bounded context is a *candidate* boundary — not automatically one, but the strongest signal you have.

**How to spot one:** look for where the *language changes*. If the "Customer" the sales team means (a lead, a deal stage) is a fundamentally different concept from the "Customer" support means (a ticket history, an entitlement), you have found a context boundary — even if today's code has one `Customer` class serving both.

```flow
dir: LR
word: Word Customer | step
sales: Sales context | store
support: Support context | store
lead: Lead, deal stage | step
ticket: Tickets, entitlement | step
word -> sales : means
word -> support : means
sales -> lead : models as
support -> ticket : models as
```

```check
Q: In a financial platform, the marketing team defines an Account as a user acquisition funnel with lead sources and referral tracking, whereas the core banking team defines an Account as an interest-bearing ledger with balance and posting rules. How should domain-driven design be applied here?
- Create a single unified Account class shared across all modules with fields for both marketing metrics and banking balances.
- Force both teams to agree on a single canonical definition of Account so that the term means the same thing everywhere.
* Define separate bounded contexts for marketing and core banking with distinct Account models and an explicit mapping between them.
- Split the database immediately without defining boundaries, since different teams must never share any domain concepts.
Why: The term Account is a polyseme that represents genuinely different concepts with different rules in marketing versus banking. DDD resolves this by giving each context its own internal model rather than forcing an awkward single canonical class. The tempting mistake of creating a single shared class violates bounded context boundaries and leads to conflicting domain logic.
```

```recall
Q: Why does DDD refuse to force one canonical definition of a polyseme like "meter"?
A: Because the term genuinely means different concepts in different parts of the org; a single canonical model would be wrong somewhere, so each context gets its own precise model with explicit mappings between them.
Q: What is the practical signal that you have found a bounded-context boundary?
A: The language changes: the same word names a fundamentally different concept, with different attributes and rules, in two parts of the system.
Q: Why is a bounded context only a candidate service boundary, not automatically one?
A: It is the strongest signal for where a boundary could go, but team structure, data ownership, and change cadence still decide whether splitting there is worth the cost.
```
