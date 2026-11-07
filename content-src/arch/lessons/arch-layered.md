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

```check
Q: A development team is maintaining an e-commerce platform built using a traditional 3-layer architecture. Which situation indicates they are suffering from the architecture's primary architectural failure mode?
- The UI layer begins importing third-party charting libraries directly.
- The business logic requires a caching proxy in front of the application server.
* A database column modification requires coordinated updates to domain models, service classes, and API controllers.
- Engineers are forced to mock external HTTP APIs when writing automated integration tests.
Why: In a layered architecture, the data layer frequently leaks upward such that database entities also serve as domain objects and API DTOs, causing any database schema change to ripple across all layers. Third-party UI libraries or external HTTP mocking relate to frontend tooling or test isolation rather than layered leakage. Caching is a general infrastructure concern and not a tell that layered architecture boundaries have failed.
```

```recall
Q: When is a layered architecture the right default?
A: Simple domains, small teams, and CRUD-heavy apps where the data model closely matches the business model; it is fast to build and everyone recognises the shape.
Q: What is the main failure mode of the layered style?
A: The data layer leaks upward: ORM entities become domain objects become API DTOs, so a schema change ripples through every layer and business logic smears across procedural service classes.
Q: What is the concrete signal that you have outgrown layered architecture?
A: You are afraid to change the database schema because you cannot predict what it will break three layers up, since nothing enforces the layer boundaries.
```
