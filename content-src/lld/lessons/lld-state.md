---
id: lld-state
chapter: lld-patterns
title: State — a machine, not a status field
minutes: 5
---
**Intent:** let an object change its behavior when its internal state changes, by putting state-specific behavior in per-state classes instead of conditionals scattered across methods.

**The signal:** the requirements keep saying "state" and transitions have real rules. When present, the state machine is usually the *centerpiece* — draw it (states as circles, transitions as labeled arrows) before coding; interviewers explicitly favour that.

The **Vending Machine** is the canonical example — states own the transitions:

```python
class NoCoinState(State):
    def insert_coin(self, m): m.set_state(HasCoinState())
    def select_product(self, m): pass        # invalid here

class HasCoinState(State):
    def select_product(self, m): m.set_state(DispenseState())
```

Compare that to one giant conditional keyed on a status string — the State pattern makes an illegal transition (dispensing before paying) structurally impossible rather than a check you might forget.

**Where else it maps:**
- **ATM** — IDLE → CARD_INSERTED → PIN_VALIDATED → TRANSACTION_SELECTED → DISPENSING; the state gates which operation is valid at each step. Same shape as the vending machine.
- **Food Delivery** — the `Order` lifecycle (placed → confirmed → preparing → out for delivery → delivered); delivering a *cancelled* order should be structurally rejected, not conditionally checked.

```flow
dir: LR
nocoin: NoCoin | gate
hascoin: HasCoin | gate
dispense: Dispensing | gate
nocoin -> hascoin : insert coin
hascoin -> dispense : select (in stock)
hascoin -> nocoin : sold out
dispense -> nocoin : item dropped
```

```recall
Q: What does the State pattern make structurally impossible that a status-field conditional only checks?
A: An illegal transition such as dispensing before paying. Each state class only implements the events legal in it (rejecting the rest), so the machine can never reach the illegal action, versus a status string you must remember to check everywhere.
Q: Where must the transition logic live, and what goes wrong if the context owns it?
A: Inside the state classes; the context only exposes a set_state() that states call. If the context decides transitions with a switch on the target, you have rebuilt the giant conditional with extra steps and lose the benefit.
Q: When is a plain enum plus switch actually the better choice?
A: When there are only 2 to 3 states and transitions are trivial with no per-state behavior. State earns its place when behavior differs per state and illegal transitions must be prevented, not merely checked.
Q: State and Strategy share a class diagram. What distinguishes them?
A: Control of change. A Strategy is chosen by the client and does not change itself; a State transitions itself to the next state in response to events, and the states know about each other.
```

===DEEPER===
The mechanism has one rule people skip: the transition logic lives *inside the state classes*, and the context exposes a package-private `set_state()` that only states call. If the context decides transitions, you've rebuilt the giant conditional with extra steps. Each state answers *every* event of the machine — usually by doing nothing (an illegal transition) or moving the machine forward. That "handle every event, mostly by rejecting" is what makes illegal transitions structurally impossible.

A fuller vending slice, including a rejected event and the context wiring:

```python
class State(ABC):
    def insert_coin(self, m): ...
    def select(self, m): ...
    def dispense(self, m): ...

class NoCoinState(State):
    def insert_coin(self, m): m.set_state(HasCoinState())
    def select(self, m): raise InvalidOp("insert coin first")  # rejected

class HasCoinState(State):
    def select(self, m):
        if m.stock == 0: m.set_state(NoCoinState()); raise SoldOut()
        m.set_state(DispenseState())

class VendingMachine:
    def __init__(self): self._state: State = NoCoinState()
    def set_state(self, s): self._state = s
    def insert_coin(self): self._state.insert_coin(self)
    def select(self): self._state.select(self)
```

**The subtle point that trips people up:** where do transitions live? Put them in the context (a `transition_to(status)` on the machine that switches on the target) and you're back to a conditional — just relocated. The state *object itself* decides the next state, so adding a state means adding a class, not editing a growing `if`. The second subtlety: guard conditions (out of stock, insufficient funds) belong to the state handling the event, not a pre-check in the context.

**Common follow-ups**
- Q: When is a simple enum + switch actually fine? A: When there are 2–3 states and transitions are trivial with no per-state behaviour. State earns its place when behaviour differs *per state* and illegal transitions must be prevented, not just checked.
- Q: How is this different from Strategy? A: Strategy is set by the client and doesn't change itself; State transitions *itself* in response to events and the states know each other. Same class diagram, opposite control of change.
- Q: Where do you store shared data like the coin balance? A: On the context (`machine.balance`), not the state objects — states are behaviour, the context is data. States are often stateless singletons.
- Q: How do you handle an event invalid in the current state? A: The current state's handler rejects it (raise / return an error) — the machine never reaches the illegal action, versus a status-field design that must remember to check.
