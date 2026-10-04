---
id: lld-idempotency-api
chapter: lld-concurrency-api
title: Idempotency and API design
minutes: 4
---
**Idempotency** — performing an operation many times has the same effect as once. It matters wherever a client might retry: a double-clicked pay button, a client retrying after a timeout without knowing if the first attempt succeeded.

The standard mechanism is an **idempotency key**: the client generates a UUID per logical operation and sends it with every retry. The server checks whether that key was already completed; if so it *replays the original result* without re-running side effects.

```python
def charge(self, idempotency_key, amount):
    if idempotency_key in self._processed:
        return self._processed[idempotency_key]   # replay, no double charge
    result = self._do_charge(amount)
    self._processed[idempotency_key] = result
    return result
```

Distinguish it from concurrency-safety: idempotency guards against the *same request arriving more than once over time*; locks guard against *different threads racing at the same instant*. A good payment `charge()` needs both — a lock around the check-and-insert of the key, plus the key itself for retry safety. In HTTP terms, `PUT`/`DELETE` are naturally idempotent; `POST` isn't, which is exactly why create endpoints need an explicit key.

**API-design rules of thumb** for the "now design the API" tail: design from the caller's need, not implementation convenience; keep methods small and intention-revealing (`makeMove(player, row, col)` over `execute(command)`); return domain types not primitives (`getWinner() -> Player?`); push validation to the boundary and keep the core clean; and model errors explicitly (a result type or `InvalidMoveException`, never a silent no-op).

```flow
dir: LR
req: Request + key | actor
seen: Key seen? | gate
replay: Replay stored result | step
run: Run side effect | step
store: Store key -> result | store
req -> seen
seen -> replay : yes
seen -> run : no
run -> store : save result
store -> replay : return result
```

```recall
Q: What problem does an idempotency key solve, and how does the server use it?
A: It makes a retried operation take effect at most once. The client sends a stable UUID per logical action with every retry; the server records key -> result and, on seeing a completed key again, replays the stored result instead of re-running the side effect.
Q: How is idempotency different from locking, and why does a payment need both?
A: Idempotency guards against the same request arriving more than once over time; a lock guards against different threads racing at the same instant. A charge needs the lock around claiming the key and the key itself for retry safety, so neither substitutes for the other.
Q: Why does POST need an explicit idempotency key when PUT and DELETE do not?
A: PUT and DELETE are idempotent by the HTTP spec: repeating them leaves the same state. POST creates a new resource each call, so a retried create duplicates unless an explicit key dedupes it.
Q: Why must the server store the response rather than recompute it on replay?
A: Recomputing can drift (a new timestamp, a changed price), which breaks the "same result" promise. Returning the stored original keeps every retry identical to the first success.
```

===DEEPER===
The mechanism is a three-state key, not a two-state one, and that third state is what people miss. An idempotency key isn't just "seen / not seen" — it's **not-started / in-progress / completed**. The gap between "started but not finished" and "finished" is exactly where a concurrent retry double-charges, so the record and the side effect must be committed together (one transaction) or the key stored *before* the side effect and reconciled.

```python
def charge(self, key: str, amount: Money) -> Result:
    with self._lock:                               # guard check-and-claim
        rec = self._keys.get(key)
        if rec and rec.state == "completed":
            return rec.result                      # replay, no re-charge
        if rec and rec.state == "in_progress":
            raise Conflict("retry in flight")      # 409, client backs off
        self._keys[key] = Record(state="in_progress")
    result = self._gateway.charge(amount)          # side effect OUTSIDE lock
    with self._lock:
        self._keys[key] = Record("completed", result)
    return result
```

**The subtle point that trips people up:** the key must be scoped to the *logical operation*, not the HTTP request, and the response must be *stored*, not recomputed — recomputing can drift (a new timestamp, a changed price) and break the "same result" promise. And "idempotent" ≠ "returns success twice": a second `DELETE` legitimately returns 404/no-op; the guarantee is *same effect*, not *same status code*.

The flip side is the Amazon-Locker contrast: a pickup code must *invalidate* after use (idempotency's opposite — succeed once, fail after), while a payment key *replays*. Same question ("seen before?"), opposite required behaviour.

**Common follow-ups**
- Q: How do you make an operation idempotent under retries? A: Client sends a stable UUID per logical action; server records key→result and replays the stored result on any retry instead of re-running side effects. Claim the key before the side effect to close the concurrent-retry window.
- Q: Which HTTP verbs are idempotent, and why does POST need a key? A: `GET`/`PUT`/`DELETE` are idempotent by spec (repeat → same state); `POST` creates a new resource each call, so a retried create duplicates unless an explicit idempotency key dedupes it.
- Q: Idempotency vs locking — do I need both? A: Yes for payments. The lock stops two threads racing at one instant; the key stops the *same request replayed over time*. Neither substitutes for the other.
- Q: Where does the key live in a multi-server deployment? A: A shared store (Redis/DB), not per-server memory — a load balancer can route the retry to a different instance, so in-memory dedup would miss it.
