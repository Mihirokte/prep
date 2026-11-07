---
id: arch-boundary-heuristics
chapter: arch-ddd
title: Where to draw the boundary
minutes: 4
---
Synthesising DDD into practical heuristics for "where does this line go":

1. **Business capability alignment** — a boundary should correspond to something the business does as a unit ("pricing," "fulfillment," "identity"), not to a technical layer. There should never be a "database service."
2. **Data ownership** — if two pieces of data are always read and written together and nothing else touches one without the other, they belong together. If a team constantly needs another team's data to do its job, either the boundary is wrong or you need a clean, explicit contract (API/event) across it, not a shared table.
3. **Team size / Conway's Law** — the org that owns a boundary needs to be a real, coherent team, not a line that cuts across half of two teams.
4. **Change cadence** — parts that change for different reasons, on different timelines, owned by different stakeholders, are a signal *for* a boundary. Parts that always change together are a signal *against* splitting them — splitting them just adds cross-service coordination for changes that were always going to ship together anyway.

The mistake to avoid: drawing boundaries around nouns you happen to see in the code, rather than around the things that change independently.

```steps
Capability | Align the boundary with something the business does as a unit, never a technical layer
Data ownership | Keep data that is always read and written together on one side of the line
Team / Conway | Make sure one real coherent team can own the boundary end to end
Change cadence | Split parts that change for different reasons on different timelines; keep together parts that always change at once
```

```check
Q: A team is refactoring a monolithic e-commerce application into services. According to boundary heuristics, which approach to drawing service boundaries is recommended?
- Split orders and inventory into separate services because 'Order' and 'InventoryItem' are different database tables.
* Keep order capture and order cancellation together in the same service because they are tightly linked and handled by the same team, while separating fulfillment tracking which changes under distinct logistics requirements.
- Create a shared database service so all application services query their data through a single consistent persistence layer.
- Divide the service boundary directly down the middle between the frontend team and backend team so each owns half of the business logic.
Why: Keeping components that share ownership and change cadence together avoids unnecessary cross-service coordination, while separating parts with distinct stakeholders and timelines creates clean capability boundaries. Splitting by database tables or entities falls into the trap of drawing lines around nouns in the code rather than independent capabilities. A shared database service creates an anti-pattern technical layer, and splitting across team halves violates Conway's law.
```

```recall
Q: Why is "a database service" a boundary anti-pattern?
A: Boundaries should align with business capabilities, not technical layers; a database service splits a horizontal layer, so every capability must cross it to do anything, which couples everyone to it.
Q: Change cadence points both ways. When is it a signal for a boundary and when against?
A: Different reasons, timelines, and stakeholders for change argue for a boundary; parts that always change together argue against splitting, since a split only adds cross-service coordination for changes that would ship together anyway.
Q: What is the core mistake these heuristics are meant to prevent?
A: Drawing boundaries around nouns seen in the code rather than around the things that genuinely change, are owned, and are consistent independently.
```
