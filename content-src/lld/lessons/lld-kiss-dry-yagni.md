---
id: lld-kiss-dry-yagni
chapter: lld-principles
title: KISS, DRY, YAGNI first
minutes: 4
---
If you remember only three principles, make it these — in this order of interview impact.

**KISS — keep it simple.** The most commonly *violated* principle in LLD rounds is KISS, not SOLID. Candidates over-engineer to show off pattern knowledge — factories, builders, decorators where a plain class and a conditional would do. Interviewers read that as over-engineering, not sophistication. Add complexity only when simplicity *stops working*: a class balloons past 10 responsibilities, or a new payment method means touching five places.

```flow
dir: LR
simple: Start simple | step
pain: Simplicity hurts? | gate
keep: Keep it simple | step
abstract: Add abstraction | step
simple -> pain
pain -> keep : no, not yet
pain -> abstract : yes, pain is real
```

**DRY — don't repeat yourself, but not blindly.** Pull duplicated logic into one place only when it's *conceptually the same thing*, not merely textually similar. Two validators that happen to look alike but serve different domain concepts should stay separate — forcing them to share code creates coupling where a change for one reason breaks the other.

**YAGNI — you aren't gonna need it.** Build for the requirements you were given. Designing a parking lot? Don't add EV charging and valet unless the prompt says so. YAGNI does *not* mean "don't think ahead" — it means design seams that *could* extend (an interface, not a hardcoded type) but don't *implement* the extension until asked.

The senior tell is holding DRY and KISS in tension out loud: "I'd keep this inline for now to avoid premature abstraction; if we see it duplicated three or four times, that's the trigger to extract."

```recall
Q: Which principle is most commonly violated in LLD rounds, and how?
A: KISS, not SOLID. Candidates over-engineer to show off pattern knowledge (factories, builders, decorators where a plain class and a conditional would do), and interviewers read that as over-engineering rather than sophistication.
Q: When should you NOT apply DRY to two similar-looking blocks?
A: When they are only textually similar but conceptually different domain concepts. Forcing them to share code couples them, so a change required for one reason now also breaks the other. Deduplicate only when it is genuinely the same thing.
Q: What does YAGNI tell you to do, and what does it NOT tell you to do?
A: Build only for the requirements you were given, so do not implement an extension (EV charging, valet) until the prompt asks. It does not mean avoid thinking ahead: design a seam that could extend, such as an interface instead of a hardcoded type, but leave it unimplemented.
Q: Why does saying the DRY/KISS tradeoff out loud read as senior?
A: Picking simple silently looks the same as not knowing the pattern. Naming the trigger ("extract once it is duplicated three or four times") shows you chose simplicity deliberately and know when the choice flips.
```
