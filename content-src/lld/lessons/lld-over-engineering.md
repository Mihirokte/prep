---
id: lld-over-engineering
chapter: lld-principles
title: When NOT to abstract
minutes: 3
---
The single biggest anti-pattern flagged across every current source is over-engineering — reaching for a pattern the requirements don't yet justify. Concretely:

```flow
dir: LR
need: Requirement justifies it? | gate
plain: Use plain code | step
pattern: Introduce the pattern | step
say: Say the tradeoff aloud | step
need -> plain : no, not yet
plain -> say : name the choice
need -> pattern : yes, real need
```

- Don't introduce a `Factory` for two hardcoded types when a constructor call is fine. Introduce it when the prompt says "support multiple X" or a third type is imminent.
- Don't wrap a 2–4-field object in a `Builder`. A `Player(name, mark)` needs a constructor. Builders earn their place when fields are numerous, optional, and validation order matters.
- Don't split a 30-line, one-responsibility class into five collaborators "for testability" — that's SRP misapplied as ceremony.
- Don't add a `Singleton` unless the requirements explicitly demand exactly one shared instance system-wide. Passing a shared object through constructors is almost always clearer and more testable.

The tell that separates a senior response from a junior one is *saying the tradeoff out loud*: "I could abstract this now, but I'd be guessing at the shape of a requirement we don't have yet, so I'm keeping it simple until it's justified." Picking simple silently reads the same as not knowing the pattern; naming the choice reads as judgment.

```recall
Q: When does a Factory earn its place, and when is it over-engineering?
A: It earns its place when the prompt says "support multiple types of X" or a third type is clearly imminent. For two hardcoded types with no growth signal a plain constructor call is simpler and a Factory is ceremony.
Q: Why is splitting a 30-line one-responsibility class "for testability" a mistake?
A: That is SRP misapplied: the class already has a single reason to change, so splitting it into five collaborators adds indirection without reducing any real coupling, and the pieces are no more testable than the whole.
Q: When is a Singleton actually justified over just passing a shared object?
A: Only when the requirements explicitly demand exactly one shared instance system-wide (a registry, a global ID generator, a connection pool). Otherwise injecting the shared object through constructors is clearer and more testable, because a Singleton hides the dependency.
Q: Why does choosing simple silently score worse than naming the tradeoff?
A: Silent simplicity is indistinguishable from not knowing the pattern. Saying "I could abstract this but I would be guessing at a requirement we do not have" shows the interviewer you know the pattern and chose against it on purpose.
```
