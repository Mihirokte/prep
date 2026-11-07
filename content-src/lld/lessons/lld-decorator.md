---
id: lld-decorator
chapter: lld-patterns
title: Decorator — stack behavior at runtime
minutes: 4
---
**Intent:** attach responsibilities to an object dynamically, as a flexible alternative to subclassing. It's specifically for *stacking combinable, runtime-optional* behaviors where subclassing would explode combinatorially (`LoggedEncryptedCompressedSource`, `EncryptedCompressedSource`, …).

The **Coffee machine with add-ons** is the classic GoF-textbook version: a base `Beverage`, wrapped by `MilkDecorator`, `SugarDecorator`, `WhipDecorator` — each adds to `cost()` and `description()` by delegating to what it wraps.

```python
class EncryptionDecorator(DataSource):
    def __init__(self, wrapped): self._wrapped = wrapped
    def write_data(self, data):
        self._wrapped.write_data(self._encrypt(data))

# stack at runtime, any order:
source = CompressionDecorator(EncryptionDecorator(FileDataSource("f")))
```

The tell for Decorator vs a plain subclass: if the behavior is *fixed at design time* and represents a stable type, subclass it. If it's *optional and combinable at runtime* — "add milk and whip but not sugar" — decorate it. Also maps to pizza/burger toppings and a logging/caching/retry middleware stack around a service call.

```flow
dir: LR
comp: CompressionDecorator | step
enc: EncryptionDecorator | step
file: FileDataSource | store
comp -> enc : delegates write
enc -> file : delegates write
```

```check
Q: You are designing a point-of-sale system for a coffee shop where customers can select any arbitrary combination of toppings (e.g., milk and whip, but no sugar) on a base drink. How should you structure this behavior based on the lesson?
- Subclass Beverage into MilkWhipBeverage, SugarBeverage, and all other combinations so each variant has a stable type at compile time.
* Wrap the base Beverage object dynamically at runtime with only the requested MilkDecorator and WhipDecorator.
- Create a single CoffeeManager class with boolean flags for milk, sugar, and whip inside its cost() calculation.
- Use Template Method in Beverage to fix the recipe steps and let MilkBeverage override only the topping step.
Why: Wrapping the base beverage dynamically at runtime allows composing only the toppings requested without a combinatorial explosion of subclasses. Subclassing every combination fails because topping selections are runtime-optional and combinable, which would lead to an unmanageable number of static classes like MilkWhipBeverage. Using boolean flags or fixed templates misses the core intent of composing independent, combinable add-on behaviors dynamically.
```

```recall
Q: What specific problem does Decorator solve that subclassing handles badly?
A: Combinable, runtime-optional behavior. Subclassing every combination (LoggedEncryptedCompressed, EncryptedCompressed, ...) explodes into a class per mix, while decorators let you wrap in any order and only the combinations you actually use exist.
Q: How does each decorator add its behavior without knowing the full stack?
A: It holds a reference to the object it wraps and delegates the call to it, adding its own work before or after. Because the wrapped object is just the same interface, decorators compose in any order and none needs to know what else is in the chain.
Q: Milk and whip but not sugar on a coffee: why Decorator rather than a subclass?
A: The topping set is chosen at runtime and combinable, so no fixed type captures it. You wrap the base beverage with exactly the decorators requested, each adding to cost() and description() by delegating to what it wraps.
Q: When is a plain subclass the right call instead of a decorator?
A: When the behavior is fixed at design time and represents a stable type distinction, not an optional runtime add-on. Then subclassing is simpler and the decorator's wrapping machinery buys nothing.
```
