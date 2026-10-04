---
id: lld-patterns-overview
chapter: lld-patterns
title: How to use patterns without forcing them
minutes: 3
---
The single biggest mistake with patterns is forcing one where plain code would do. Hello Interview's guidance, verbatim: "Most interview-ready designs use no patterns, or at most one or two. If you're reaching for three or more, you're probably forcing it." Patterns should *fall out of* good design decisions, not drive them.

The eight-ish that actually recur:

- **Creational:** Factory (create the right type), Builder (complex optional-field construction), Singleton (mostly *not* — prefer injection).
- **Structural:** Adapter (wrap a mismatched third-party interface), Decorator (stack runtime-optional behavior), Facade (your orchestrator class already is one).
- **Behavioral:** Strategy (swap an algorithm), Observer (fan out a state change), State (state-specific behavior in per-state classes), Command (undo/redo/queued execution), Template Method (shared step sequence, differing steps).

Two contrasts worth memorising because interviewers probe them:

```flow
dir: LR
input: Type input | actor
factory: Factory | step
strat: Strategy object | step
client: Client | step
input -> factory : "EQUAL"
factory -> strat : creates
strat -> client : handed back
client -> strat : delegates behavior
```

- **Factory vs Strategy** — Factory decides *which object to create*; Strategy decides *which behavior* an already-created object delegates to. They often appear together (a factory hands back a strategy).
- **Decorator vs subclass** — Decorator is for *runtime-composable* behavior; a plain subclass is for a stable type distinction fixed at design time.

```recall
Q: What is the single biggest mistake with design patterns in an interview?
A: Forcing a pattern where plain code would do. Patterns should fall out of good design decisions, not drive them; reaching for three or more is a sign you are forcing them.
Q: How do you distinguish Factory from Strategy, and why do they often appear together?
A: Factory decides which concrete object to create; Strategy decides which behavior an already-created object delegates to. They compose because a factory can pick and hand back the strategy an object will then use.
Q: When would you choose a Decorator over a subclass?
A: Choose Decorator when the behavior is runtime-composable and combinable (add logging and caching and retry in any mix). Choose a subclass when the distinction is a stable type fixed at design time, because decorators pay for flexibility you would not use.
Q: Why is Singleton usually the wrong default among the creational patterns?
A: It hides dependencies and makes substitution for tests hard, so passing a shared object by injection is almost always clearer. Reach for it only when exactly one shared instance system-wide is a real requirement.
```
