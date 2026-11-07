---
id: lld-testing-machine-code
chapter: lld-round
title: Testing during machine coding
minutes: 3
---
A machine-coding solution is not finished when the happy path runs. The interviewer needs evidence that the public behavior is correct, the design is changeable, and failures do not corrupt state. Good testing starts from invariants, not from chasing a coverage percentage.

## Start with invariants

An invariant is a fact that must remain true after every public operation. For a task scheduler: one id identifies at most one live task, execution returns the highest-priority task, equal priorities keep creation order, and a removed task never executes. These statements turn directly into tests and expose design mistakes earlier than broad end-to-end scenarios.

```steps
State invariants | Write the facts that every operation must preserve
Partition inputs | Cover normal, boundary, invalid, and repeated calls
Test public behavior | Prefer the API over private fields and containers
Force failure | Verify exceptions and partial work do not corrupt state
Add one race | Coordinate competing operations without arbitrary sleeps
```

## Use the cheapest layer

Put a behavior at the cheapest layer that can prove it. Pure selection and state-transition logic belongs in fast unit tests. Persistence semantics need an integration test against the real database or a faithful local equivalent. A public workflow deserves a small number of end-to-end tests.

Mocks are useful at slow or nondeterministic boundaries, such as time, random ids, networks, and payment providers. They are harmful when they merely repeat implementation details. If changing a private helper breaks ten tests while public behavior is unchanged, the tests are coupled to the wrong surface.

```flow
dir: LR
rule: Pure rule | step
unit: Unit test | gate
store: Database behavior | store
integration: Integration test | gate
journey: Public workflow | step
e2e: Small E2E set | gate
rule -> unit
store -> integration
journey -> e2e
```

## Test time and concurrency

Never make a test wait for real minutes. Inject a clock and advance a fake clock explicitly. The same rule applies to ids and random choices: inject the source so the test controls it.

Concurrency tests need coordination, not `sleep`. Use a barrier to release workers at the same instant, then assert an invariant such as exactly one successful seat reservation. Run the test repeatedly, but do not mistake repetition for proof. The design should make the atomic boundary visible: a lock, transaction, or compare-and-set protects the whole state transition.

## Finish the round

Before declaring done, run a compact table: empty state, smallest valid input, repeated operation, invalid input, normal path, failure halfway through, and the main race. State what remains untested and why. That honesty is stronger than pretending a rushed demo has production confidence.

```recall
Q: Why should tests begin with invariants rather than methods?
A: Invariants describe required behavior across operations, so tests survive refactoring and catch state corruption that isolated method examples miss.
Q: When is a mock appropriate?
A: At a slow or nondeterministic boundary such as time, randomness, or a network, not as a replacement for testing the behavior of your own objects.
Q: Why is sleep a poor concurrency-test tool?
A: Scheduling is nondeterministic, so sleeps make tests slow and flaky; barriers and latches create the intended interleaving directly.
Q: What is the smallest useful test stack in a machine-coding round?
A: Unit tests for rules, one integration test for an important real boundary, and a small public-API workflow test.
```
