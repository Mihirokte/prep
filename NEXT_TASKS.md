# Prep portal handoff

Updated: 2026-11-06

## Product direction

- Keep one coherent technical SDE-2 preparation portal. Do not create alternative or agent-specific tracks.
- Technical preparation only: no CV, resume, or behavioural-interview modules.
- Optimise for teaching, reading, recall, and deliberate practice. Avoid adding decorative or high-complexity UI without a learning benefit.
- DSA, LLD, system design, architecture, operations, security, and AI engineering all belong in the same curriculum.

## Completed in the current working tree

- Added substantive lessons and drills for runtime/concurrency, machine-code testing, transaction isolation, schema migrations, production debugging, capacity/load, threat modelling, and data lifecycle/deletion.
- Added additive `drills.json` ingestion to `scripts/build-content.ts`, rebuilt the seed, and bumped the seed revision to 6.
- Reordered learning areas so DSA/LLD/system foundations precede AI.
- Changed review eligibility so unseen cards do not flood the queue before their lesson is read.
- Made Home's next-lesson choice follow the explicit curriculum order.
- Added visible app loading feedback and chapter summaries.
- Added deferred DSA search, editor autosave, a real editor reset, and automatic `attempted` status on validation.
- Re-enabled offline local correctness cases in the bundled Pyodide worker when a problem pack has authored tests; syntax-only fallback remains explicit.
- Updated README counts and behaviour descriptions.
- Fixed the verifier to find the dynamic local-validation button by accessible label. The previous timeout was caused by verification waiting for the old literal `Check syntax` text after the button became `Run 6 tests`, not by evidence of a Pyodide boot failure.

Current seed totals (revision 9): 6 courses, 46 chapters, 562 lessons, 254 drills, and 29 DSA patterns. 109 of 148 DSA packs have local correctness cases; 99 lessons have a mid-lesson `check`.

## Verification already completed

- `npm run typecheck` — pass after the final verifier fix.
- `npm run lint` — pass after the final verifier fix.
- `npm run verify:seed` — pass (all content integrity and seed-merge checks).
- `npm run verify:app` — 12/13 checks passed across 985 routes, including all route, night/day design, scrolling, renderer-error, and CSP checks. The sole failure was the stale button-text selector described above.
- `git diff --check` — pass.

## Done on 2026-11-07

- Task 1: `verify:app` passes 30/30. The verdict check had a broken regex (`\\d` in a TS regex literal); fixed. Starter code returning `None` gives an honest "Test 1 failed" verdict.
- Task 2: `src/main/verify.ts` now checks attempted status, authored tests (reference solution passes 6/6), syntax-only fallback, autosave, Reset (editor and disk), Home curriculum order, and review eligibility before and after a lesson is read.
- Task 6: `src/renderer/progressFile.ts` validates imports (Export files, the app's `progress.json`, old files without recall), skips and reports invalid records, and merges instead of replacing. Home shows the result or the error. `npm run verify:progress` (38 checks) covers parsing, merging, and seed migration from every committed seed revision with learner edits, deletions and created records.
- Note: from the agent shell, run the suite with `npx electron --no-sandbox dist/verify/index.cjs` after `npm run build`; the Chromium sandbox cannot start there.

## Next tasks, in order

3. Done (revision 9): `scripts/author-tests.ts` gave 104 more packs local cases (109 of 148). agy proposes inputs only; python3 runs the reference solution, a pack is kept only if the reference reproduces every statement example, and edge expectations are the reference's output. Remaining 39: linked-list, tree, in-place and class packs (the worker passes plain values only), problems with several valid answers (Course Schedule II), and packs whose statement has no example. They need a custom checker in the worker.
4. Done (revision 9): `scripts/author-checks.ts` added a `check` to 93 sd/lld/arch/ops/sec lessons, each grounded on a verbatim quote from the lesson. Skipped: 8 core lessons and 10 reverse-engineering lessons where no grounded question passed.
5. Done (seed revision 7): the AI from Scratch course is gone. 407 of its lessons are chapters of AI Engineering, 14 reverse-engineering lessons are a Security chapter, and 121 lessons that repeated a topic were removed, as were 6 duplicates between the original courses. Source "Phase X · YY" and "Lesson NN" references are now Prep links (seed revision 8). Infrastructure & Production lessons now open with a note that their prices and latencies are 2025-26 snapshots. Remaining: a line-by-line fact check of the imported lessons; 123 lessons have no questions until Generate is pressed.
6. Add validation and actionable error reporting around progress import/export, then test migration from older seed revisions without overwriting learner-authored state.
7. Continue expanding operations and security only where the SDE-2 curriculum audit shows a concrete gap; keep lessons concise and scenario-driven.

## Guardrails for the next agent

- Read the current diff before editing; all uncommitted files are intentional work from this pass.
- Preserve learner progress and custom content during seed merges.
- Treat content files as curriculum source and regenerate `seed/content.json` through the existing build scripts; do not hand-edit the generated seed.
- Do not claim local correctness coverage for packs without authored tests.
- Do not add a new track, CV tooling, behavioural drills, package dependencies, or external services unless the user explicitly changes direction.
