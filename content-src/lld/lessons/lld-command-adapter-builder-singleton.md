---
id: lld-command-adapter-builder-singleton
chapter: lld-patterns
title: Command, Adapter, Builder, Singleton, Template Method
minutes: 4
---
The rest of the recurring set, each in one line of "when it earns its place":

- **Command** — encapsulate a request as an object with everything needed to run (and undo) it. Signal: **undo/redo, an action history, deferred/queued execution**. A text editor's undo stack, an elevator's queued floor requests as command objects, a job scheduler with rollback. Pairs a `Command.execute()`/`undo()` interface with a `CommandHistory` stack.

```flow
dir: LR
client: Client | actor
cmd: Command | step
recv: Receiver | step
hist: History stack | store
client -> cmd : execute()
cmd -> recv : acts on
cmd -> hist : push for undo
hist -> cmd : pop -> undo()
```
- **Adapter** — convert a third-party/legacy interface into the one your system expects, when you can't modify it. Wrapping a legacy `XMLPaymentGateway` behind your `PaymentProcessor` interface; wrapping several vendors' SDKs behind one common interface.
- **Builder** — separate construction of a complex object from its representation. Earns its place with *many optional fields* and validation order that matters: HTTP request builders, config objects, query builders. Not for a 2–4-required-field domain object.
- **Singleton** — exactly one instance system-wide. The honest take: mostly *don't*. It hides dependencies and makes testing harder (you can't substitute a double for `getInstance()`). Prefer injecting the shared object. When it genuinely earns its place — a parking-lot registry, a global ID generator, a connection pool — thread-safe lazy init is a detail interviewers do *not* expect you to code live.
- **Template Method** — a fixed skeleton in a base class, subclasses override steps. Simpler than Strategy when the *sequence itself* is the shared contract: a game framework's `setup() → play() → end()`, a report pipeline's `fetch() → transform() → write()`.

```check
Q: You are designing software for a robotic drawing arm that needs to support stepping backward to undo previous strokes and queuing up a sequence of movements. Which design pattern best addresses this requirement?
- Adapter pattern, by translating the robot's hardware interface into standard editor method calls.
* Command pattern, by encapsulating each drawing motion into an object with execute() and undo() methods pushed onto a history stack.
- Builder pattern, by assembling drawing instructions in a multi-step configuration sequence before sending them to the arm.
- Singleton pattern, by ensuring only one global instance of the robotic arm exists across all software threads.
Why: Encapsulating drawing actions into Command objects carrying both execute() and undo() methods naturally enables undo/redo and deferred execution via a history stack. While Builder configures objects with many optional fields, it does not manage action history, execution queues, or reversibility. Adapter bridges incompatible interfaces but provides no mechanism for rolling back state transitions.
```

```recall
Q: What signal tells you a problem wants the Command pattern?
A: Undo/redo, an action history, or deferred/queued execution. Encapsulating a request as an object with execute() and undo() lets you push it on a history stack or a queue and reverse it later, which a plain method call cannot.
Q: When do you reach for an Adapter?
A: When you must fit a third-party or legacy interface into the one your system expects and you cannot modify it. You wrap the foreign class (an XMLPaymentGateway) behind your own interface (PaymentProcessor) so the rest of the code depends only on your contract.
Q: Builder vs a plain constructor: when does Builder earn its place?
A: When the object has many optional fields and the validation order matters (HTTP requests, config, queries). For a 2 to 4 required-field domain object a constructor is clearer, so a Builder there is over-engineering.
Q: How is Template Method different from Strategy when both vary behavior?
A: Template Method fixes the step sequence in a base class and lets subclasses override individual steps, so the shared contract is the sequence itself. Strategy swaps a whole algorithm behind one call and does not prescribe an order.
```
