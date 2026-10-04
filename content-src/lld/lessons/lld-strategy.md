---
id: lld-strategy
chapter: lld-patterns
title: Strategy — the most important one
minutes: 4
---
**Intent:** define a family of interchangeable algorithms and let the one in use vary independently of the client. It's the most-requested LLD pattern because it directly tests polymorphism + composition-over-inheritance.

**The signal:** a pile of `if/elif` or `switch` branching on a type or mode is a Strategy waiting to happen.

```python
class PaymentStrategy(ABC):
    @abstractmethod
    def pay(self, amount: float) -> bool: ...

class CreditCardPayment(PaymentStrategy):
    def pay(self, amount): ...   # card logic

class ShoppingCart:
    def set_payment_strategy(self, s: PaymentStrategy): self._strategy = s
    def checkout(self, amount): self._strategy.pay(amount)
```

**Where it maps:**
- **Splitwise** — an `ExpenseSplit` interface with `EqualSplit`, `ExactSplit`, `PercentSplit`, validated so shares sum to the total. This is the textbook Strategy slot.
- **URL Shortener** — a `ShortCodeGenerator` strategy: base62 counter vs. random-with-collision-check vs. hash-of-URL. (The LLD version is about the in-memory map and the generation algorithm, not distributed IDs — say so if the prompt is ambiguous.)
- Parking-fee calculation by vehicle type, surge vs. flat pricing, discount rules — all Strategy.

```flow
dir: LR
cart: Context (ShoppingCart) | step
iface: PaymentStrategy | gate
card: CreditCardPayment | step
upi: UpiPayment | step
cart -> iface : delegates pay()
card -> iface : implements
upi -> iface : implements
```

```recall
Q: What signal in a prompt tells you to reach for Strategy?
A: A pile of if/elif or switch branching on a type or mode. Each branch is one algorithm, so lifting them behind one interface and holding a reference is exactly Strategy.
Q: If the context ever isinstance-checks its strategy, what has gone wrong?
A: The pattern has collapsed back into the conditional you were escaping. The whole point is that the context delegates through the interface without knowing the concrete type, so a type check re-couples it to every strategy.
Q: Where should the validation for a split (percents sum to 100, exact shares sum to the total) live, and why?
A: Inside each concrete strategy, not in the context. Putting it in the context forces an isinstance check per type and re-couples it; keeping each invariant in its own strategy keeps the context ignorant and adding a strategy a pure addition.
Q: When is a plain function enough instead of a full Strategy object?
A: When the behavior is a single method with no state or config, a first-class function is a lightweight Strategy. The object earns its place once the strategy needs multiple methods, its own state, or a name in the type system.
```

===DEEPER===
Strategy has three moving parts people conflate: the **Context** (holds a reference and delegates), the **Strategy interface** (the one method the context calls), and the **concrete strategies**. The context must *not* know which concrete one it holds — if it ever `isinstance`-checks the strategy, the pattern has collapsed back into the conditional you were escaping.

A fuller Splitwise slice showing validation living *in* each strategy, which is where the correctness lives:

```python
class ExpenseSplit(ABC):
    @abstractmethod
    def shares(self, total: float, users: list, meta: dict) -> dict: ...

class PercentSplit(ExpenseSplit):
    def shares(self, total, users, meta):
        pct = meta["percents"]            # {user: percent}
        if abs(sum(pct.values()) - 100) > 1e-9:
            raise ValueError("percents must sum to 100")
        return {u: total * pct[u] / 100 for u in users}

class Expense:
    def __init__(self, split: ExpenseSplit): self._split = split
    def compute(self, total, users, meta): return self._split.shares(total, users, meta)
```

**The subtle point that trips people up:** where does validation live? A weak answer validates in the `Expense`/context (`if isinstance(split, PercentSplit): check...`) — that re-couples the context to every concrete type and defeats the pattern. Each strategy validates its *own* invariant (percents sum to 100, exact shares sum to the total). The context stays ignorant.

**Common follow-ups**
- Q: How is Strategy different from just passing a function? A: For one behaviour, a first-class function *is* a lightweight Strategy. The pattern earns its keep when the strategy needs multiple methods, its own state/config, or a name in the type system — then an object beats a bare lambda.
- Q: Strategy vs State — same UML, so what's the difference? A: Intent. Strategy is chosen by the *client* and rarely changes itself; State transitions *itself* to the next state based on events. Strategy objects usually don't know each other; State objects do.
- Q: Where does the factory fit? A: A factory picks *which* strategy to instantiate from input ("EQUAL" → `EqualSplit`); Strategy governs how the chosen one behaves. They compose — factory creates, strategy executes.
- Q: How do you set the strategy — constructor or setter? A: Constructor injection when it's fixed for the object's life; a setter only if it genuinely varies at runtime. Prefer the constructor to keep the object always-valid.
