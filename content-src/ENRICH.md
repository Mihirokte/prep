# Enrichment pass: diagrams and self-checks for existing lessons

Context: Prep is a study app. Lessons are markdown files at `/Users/mihirokte/projects/prep/content-src/<course>/lessons/<id>.md` (front matter, body, optional `===DEEPER===` section). The app renders fenced blocks as live, animated diagrams. The exact block syntax is defined in `/Users/mihirokte/projects/prep/content-src/ai/SPEC.md` under "Rich blocks" (flow, mermaid sequence, stack, bars, steps, recall, callouts). Read that section first.

Your job is to make each lesson in your course better to study from by adding diagrams and a self-check, WITHOUT rewriting what is already there.

## Rules

1. Edit each file in place with small insertions (the write tool's strReplace or insert). Never recreate a file from scratch. Keep the front matter, every existing sentence, and the `===DEEPER===` marker exactly as they are. Existing text may contain non-ASCII punctuation; leave it.
2. Add 1 to 3 rich blocks per lesson, each placed right after the paragraph it illustrates. Choose the block that fits the content:
   - `flow` for architectures, data paths, pipelines, decision trees, state machines, request routing.
   - `steps` for an ordered procedure (a migration, a handshake, a deployment, an algorithm's phases).
   - `stack` or `bars` for budgets and comparisons, but only with numbers the lesson already states or that follow by simple arithmetic from it. If you add an illustrative number, say so in the title ("illustrative").
   - `mermaid` sequence only for request/response ordering that no existing diagram in the lesson already shows.
   Never duplicate an existing diagram. A lesson that already has a diagram still gets a `recall` block, plus one more block only if there is something genuinely worth drawing.
3. If the body has no `recall` block, append exactly one at the end of the body (before `===DEEPER===` if present): 3 or 4 questions that test understanding (why, when, what breaks, what you would choose), not vocabulary. Answers 1 to 3 sentences, correct, and consistent with the lesson text.
4. Every new claim must be true. If you add a fact that is not already in the lesson, verify it with web_search / web_fetch against a primary source first. Prefer drawing what the lesson already says.
5. Block syntax limits: at most 12 flow nodes, node labels at most 28 characters, edge labels at most 24 characters, every edge endpoint declared as a node first, 2 to 8 rows for stack/bars, 3 to 8 steps. New text you write uses plain ASCII punctuation (write `->` for arrows, no em dashes, no emojis).
6. Do not add callouts unless the lesson already makes exactly that point; at most one per lesson.
7. When finished with all your lessons, run from `/Users/mihirokte/projects/prep`: `node scripts/run-ts.mjs scripts/build-content.ts --course=<your course key> --check` (it validates and writes nothing). Fix every ERROR it reports in your files, then reply with only the count of lessons edited and anything you skipped.

Write each file's edits as soon as you finish that lesson.
