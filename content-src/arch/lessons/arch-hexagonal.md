---
id: arch-hexagonal
chapter: arch-styles
title: Hexagonal / ports and adapters
minutes: 4
---
Also called ports-and-adapters, and closely related to Clean Architecture. The domain logic sits at the centre with zero knowledge of infrastructure. It exposes **ports** (interfaces like `OrderRepository`) that **adapters** implement — a Postgres adapter, an in-memory adapter for tests, a REST controller adapter that drives the domain from the outside.

Clean Architecture (Robert C. Martin) is the same idea drawn as concentric rings (entities inside use cases inside interface adapters inside frameworks) with one rule: **the dependency rule** — dependencies only ever point inward, never outward. The core never imports the framework.

```flow
dir: LR
rest: REST adapter | tool
core: Domain core | step
port: OrderRepository | gate
pg: Postgres adapter | store
mem: In-memory adapter | store
rest -> core : drives
core -> port : depends on
pg -> port : implements
mem -> port : implements
```

**When it wins:** you need to swap infrastructure without touching business logic (a different DB per environment, adding a queue trigger beside an HTTP one), or you want to unit-test domain logic with no framework mocking. It pays off when the domain is genuinely complex enough to be worth protecting.

**When it hurts:** it is overkill for a thin-logic CRUD app. You pay real ceremony — interfaces everywhere, DTO mapping at every boundary — for flexibility you never use. And nothing enforces the boundary except discipline and code review, so teams new to it build the skeleton correctly and then leak infra concerns into the "core" anyway.

```recall
Q: What does the dependency rule actually forbid?
A: The core importing the framework or infrastructure; dependencies point only inward, so domain logic defines ports as interfaces and adapters on the outside implement them, never the reverse.
Q: Why does hexagonal make domain logic easy to unit-test?
A: The core depends only on port interfaces, so tests supply in-memory adapters instead of a real database or HTTP layer, removing the need to mock a framework.
Q: When is ports-and-adapters the wrong call?
A: For a thin-logic CRUD app where the domain is not complex enough to protect; you pay interface and DTO-mapping ceremony for flexibility you never exercise.
```
