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

Current seed totals (revision 10): 6 courses, 46 chapters, 562 lessons, 254 drills, and 29 DSA patterns. All 148 DSA packs have local correctness cases; 117 lessons have a mid-lesson `check`.

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

## Done on 2026-11-17

- Task 3 closed: all 148 DSA packs have local tests. The Pyodide judge (`src/renderer/public/validate-worker.mjs`) now converts linked lists, trees (level-order arrays), random-pointer lists and graphs; supports in-place edits on any of them, round-trip codecs, `class Solution` methods, and `compare: custom` with a pack-level `checker_code`. `scripts/author-structured.py` holds the hand-written cases; a pack is changed only if its reference reproduces every statement example. `npm run verify:judge` runs the shipped judge over all 148 packs (reference passes, starter fails). `verify:app` runs six structured packs through the real Pyodide worker.
- Bugs found on the way: `class Solution` packs with tests could not resolve their symbol (41 packs), and Rotate Image's tests expected `null`, so any solution passed (now an in-place test). Wrong `merge` resolution came from star imports, which were dropped.
- Task 4 closed: every sd/lld/arch/ops/sec lesson has a `check` (117 lessons in total). About 40 of those checks have a correct option that is noticeably longer than the others (the build warns); rewrite them when convenient.
- Task 5 (fact check): Infrastructure & Production chapter checked against sources by four parallel reviewers; about 40 corrections made (Bedrock/Azure pricing, k6 version, llm-d founders, CNCF levels for Litmus/Chaos Mesh, vLLM dates, Jetson/Apple TOPS figures and more). Unsourceable figures (Artificial Analysis 405B TTFT, MIT 89% outage prediction) were removed. Seed revision 10.

## Phone access (done 2026-11-26)

- `src/main/webserver.ts` serves the built pages and a JSON/SSE API on loopback; `src/main/handlers.ts` is the one call table shared with Electron IPC (`WEB_CHANNELS` is the phone's allowlist; agent and tutor generate/verify are excluded). Auth is the Tailscale login header plus Host/Origin checks.
- Progress merges on the server for web writes (`src/shared/progressMerge.ts`); the Mac window overwrites so Reset still works and merges pushes from the phone (`useProgressSync`). The to-do list (`src/shared/todos.ts`) is stored under its own progress key with tombstones.
- The renderer picks `window.prep` (preload) or an HTTP client (`webApi.ts`, installed by `installWeb.ts`); `isWebClient` gates the assistant, editor, timer, tutor tabs.
- `verify:app` includes 25 phone checks; screenshots are `verify-report/phone-*.png`.
- Not yet covered: a real iPhone pass over Tailscale (touch targets are checked from the stylesheet only; the verifier cannot emulate a coarse pointer); text selection and long-press behaviour on iOS.

## Next tasks, in order

1. Fact-check the other imported AI chapters, same method: Tools & Protocols, Agent Engineering, Multi-Agent, Ethics & Safety, Capstone Projects are the most likely to contain stale product names and versions. Math, ML and Deep Learning Core are low risk.
2. Fill the 123 imported lessons that have no questions (they generate on demand today).
3. Rebalance option lengths in the ~40 checks the build warns about.
4. Continue expanding operations and security only where the SDE-2 curriculum audit shows a concrete gap; keep lessons concise and scenario-driven.

## Guardrails for the next agent

- Read the current diff before editing; all uncommitted files are intentional work from this pass.
- Preserve learner progress and custom content during seed merges.
- Treat content files as curriculum source and regenerate `seed/content.json` through the existing build scripts; do not hand-edit the generated seed.
- Do not claim local correctness coverage for packs without authored tests.
- Do not add a new track, CV tooling, behavioural drills, package dependencies, or external services unless the user explicitly changes direction.
