---
id: arch-api-versioning
chapter: arch-cross-cutting
title: API versioning and evolution
minutes: 4
---
The core principle across nearly every current source: **version only when you make a genuinely breaking change.** Prefer backward-compatible, additive evolution whenever possible, because versioning is itself a maintenance cost.

```flow
dir: LR
change: Proposed change | step
q: Breaking? | gate
add: Ship additively | step
ver: Cut new version | step
dep: Deprecate old | step
change -> q
q -> add : no
q -> ver : yes
ver -> dep : Sunset header
```

Strategies, with a practical split:
- **URI versioning** (`/v1/orders`) — the pragmatic default for public APIs: visible, cache-friendly, trivially routable at a gateway.
- **Header-based versioning** (a custom header or `Accept` media-type) — better for internal services where you control every client, since URIs stay stable. It is the one most poorly implemented in practice: teams forget to enforce that clients send it and silently default to "latest," which quietly breaks old clients.
- **Date-based versioning** — pin a client to a release date, resolve internally; the more granular option, common where an API ships frequent additive changes.

**The trap:** "additive" is not the same as "safe." Adding a new optional field or a new endpoint is generally safe; renaming or removing a field, changing a field's type, or changing existing behaviour is breaking — even if the JSON shape looks unchanged. Adding a *required* field, or a new enum value an old client's switch statement doesn't handle, breaks clients despite looking additive.

**Deprecation:** announce with real dates, use a `Sunset` HTTP header where applicable, and give clients a genuine migration window rather than a silent cutover.

```recall
Q: Why is adding a new required field a breaking change even though it looks additive?
A: Existing clients do not send the field, so requests that worked before now fail validation; "additive" only means safe when old clients keep working unchanged.
Q: When would you choose header or media-type versioning over URI versioning?
A: For internal services where you control every client and want URIs to stay stable; its risk is that teams forget to enforce the header and silently default to latest, breaking old clients.
Q: What does the Sunset header plus a dated deprecation window prevent?
A: A silent cutover; it gives clients explicit notice and time to migrate before the old version stops working.
```
