---
id: lld-solid
chapter: lld-principles
title: SOLID, with the honest caveat
minutes: 5
---
SOLID came from inheritance-heavy Java/C#-era design. Applying it *maximally* is falling out of fashion — modern code favours composition and plain functions. Apply it when the problem calls for it; recognise when you're adding ceremony. Saying that caveat out loud signals judgment.

- **S — Single Responsibility.** One reason to change. A `Report` that generates content *and* formats PDF *and* writes files should split into `Report`, `PDFPrinter`, `FileStorage` — so a PDF-library upgrade touches only one class.
- **O — Open/Closed.** Extend without modifying working code. A `PaymentProcessor` with an `if type == "credit" … elif "paypal"` chain must be edited for every new type. Give it a `PaymentMethod` interface instead, and a new `CryptoPayment` class is zero edits elsewhere.
- **L — Liskov Substitution.** A subclass must work anywhere the base does. A `Penguin(Bird)` whose `fly()` raises is a violation; split the capability into a `FlyingBird`. Red flags: a subclass raising `NotImplementedError`, or callers doing `if isinstance(x, Penguin)`.
- **I — Interface Segregation.** Don't force implementers to stub methods they don't need. A `Robot` shouldn't implement `eat()`/`sleep()` as no-ops — split into small `Workable` / `Feedable` interfaces composed per capability.
- **D — Dependency Inversion.** Depend on an abstraction your business logic defines, not a concrete class. `NotificationService` takes a `MessageSender` interface in its constructor (dependency injection is the technique; DIP is the principle) — now you unit-test with a mock and swap email for SMS with zero changes.

```flow
dir: LR
svc: NotificationService | step
iface: MessageSender | gate
email: EmailSender | tool
sms: SmsSender | tool
svc -> iface : depends on
email -> iface : implements
sms -> iface : implements
```

```recall
Q: Why does over-applying SOLID read as weak judgment rather than strength?
A: SOLID came from inheritance-heavy design; applying it maximally adds ceremony (needless interfaces, split classes) that modern composition-first code avoids. Naming when a principle does not yet pay off signals you weigh cost against benefit instead of following rules by rote.
Q: SRP says one reason to change. Why is that about actors, not method count?
A: A reason to change traces to a person or role requesting it, so a class with ten cohesive methods that all change for one actor is fine, while a two-method class serving two unrelated actors violates SRP. Splitting by size misreads the principle.
Q: What exactly makes a subtype an LSP violation?
A: It stops being substitutable for the base: it strengthens preconditions, weakens postconditions, throws on an inherited method, or forces callers to isinstance-check. A Penguin whose fly() raises breaks every caller written against Bird.
Q: In the DIP example, which way does the dependency arrow point and why does that help?
A: Both NotificationService and the concrete senders point at the MessageSender abstraction that the business logic owns, so the arrow points inward. That lets you inject a mock in tests and swap email for SMS without touching the service.
```

===DEEPER===
The precise version of each letter is sharper than the slogan. **SRP's "one reason to change"** means one *actor* — group behaviour by who requests the change, not by what the code touches. An accountant and a DBA both editing a `Report` class is the smell, even if both changes are "about reports". **OCP** is achieved by depending on a stable abstraction and adding new *implementations*; you don't literally never edit files, you avoid editing the *tested, working* class. **LSP** is about behavioural substitutability, not just compiling — a subclass may not strengthen preconditions or weaken postconditions (a `ReadOnlyList` that throws on `add()` breaks callers written against `List`).

Worked example — a naïve order processor that violates all five, then the DIP+OCP fix:

```python
class OrderService:
    def __init__(self, sender: MessageSender, store: OrderStore):
        self._sender = sender      # abstraction, not EmailSender
        self._store = store

    def place(self, order: Order) -> None:
        self._store.save(order)                    # SRP: persistence elsewhere
        self._sender.send(order.customer, "placed") # DIP: interface

class DiscountPolicy(ABC):
    @abstractmethod
    def apply(self, order: Order) -> Money: ...
# new policy = new class, OrderService untouched (OCP)
```

**The subtle point that trips people up:** SRP is about *reasons to change*, not *number of methods*. A class with ten cohesive methods that all change for the same reason is fine; a two-method class that changes for two unrelated reasons violates SRP. People split by size and think they've "done SOLID".

**Common follow-ups**
- Q: How is DIP different from just dependency injection? A: DI is the *mechanism* (pass the dependency in); DIP is the *principle* (the dependency is an abstraction your module owns, so the arrow points inward). You can DI a concrete class and still violate DIP.
- Q: Doesn't OCP mean I can never edit a class? A: No — you avoid modifying *stable, tested* behaviour. Bug fixes and new abstractions are fine; adding a variant should mean a new implementation, not an edit to the branching.
- Q: When is inheritance an LSP violation vs fine? A: Fine when every subtype honours the base contract everywhere the base is used. A violation the moment callers must `isinstance`-check or a subclass throws on an inherited method.
- Q: Is applying all five always right? A: No — over-applying ISP/DIP on a small design adds ceremony. Name the tradeoff: "I'd keep this concrete until a second implementation is real."
