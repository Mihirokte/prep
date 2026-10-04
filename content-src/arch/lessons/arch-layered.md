---
id: arch-layered
chapter: arch-styles
title: Layered architecture
minutes: 3
---
The oldest, most familiar shape: organise code into horizontal layers — presentation on top, then business/domain, then data access — where each layer only calls the one below it. Most CRUD apps start here, and that is fine.

```flow
dir: TB
pres: Presentation | step
biz: Business logic | step
data: Data access | step
db: Database | store
pres -> biz : calls down
biz -> data : calls down
data -> db : queries
```

**When it wins:** simple domains, small teams, CRUD-heavy apps where the data model closely matches the business model. It is fast to build and easy to onboard onto, because everyone recognises the shape.

**When it hurts:** the data layer tends to leak upward. ORM entities become domain objects become API DTOs, so a schema change ripples through every layer. Business logic ends up smeared across "service" classes that are really procedural scripts sitting on the database. And nothing *enforces* the boundaries — a UI calling the repository directly compiles just fine, so shortcuts accumulate.

The tell that you have outgrown it: you are afraid to change the database schema because you can't predict what it will break three layers up.

```recall
Q: When is a layered architecture the right default?
A: Simple domains, small teams, and CRUD-heavy apps where the data model closely matches the business model; it is fast to build and everyone recognises the shape.
Q: What is the main failure mode of the layered style?
A: The data layer leaks upward: ORM entities become domain objects become API DTOs, so a schema change ripples through every layer and business logic smears across procedural service classes.
Q: What is the concrete signal that you have outgrown layered architecture?
A: You are afraid to change the database schema because you cannot predict what it will break three layers up, since nothing enforces the layer boundaries.
```
