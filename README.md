# Prep

A local Mac app for interview study and practice, drawn in a pixel-typeset,
drafted-paper style (night by default, day with the switch in the toolbar).
Seven study areas — DSA plus six courses (low-level design, system design,
architecture, AI engineering, production and ops, security) — whose lessons
carry animated diagrams and self-check cards; 241 drills, of which 148 are
Python problems in a split-pane workspace (statement, hints, approach, editor,
offline syntax check); 29 pattern cards, each with a step-through
walk-through of the real algorithm, mapped to every problem; a spaced-review
deck built from the lessons' self-check cards; and company research with
questions, answer sketches and variants. Progress is kept on disk. An
assistant (⌘J) creates, reads, updates and deletes any record through
natural-language commands, with a diff to approve and one-click undo.

Everything the app needs ships in this repository. It runs offline; only the
assistant talks to anything else (a local CLI, see below).

## Prerequisites

| Requirement | Why | Installed by `setup.sh`? |
|---|---|---|
| macOS 13 Ventura or newer, Intel or Apple Silicon | Electron 44's floor | — |
| Xcode Command Line Tools | provides `git`; Homebrew needs them | requests the system install dialog |
| Homebrew | used only to install Node | yes, with confirmation |
| Node.js 22.12 or newer (26 is what this was built with) | build tooling | yes, with confirmation |
| ~1 GB free disk | dependencies, Electron, Pyodide, the built app | — |
| Antigravity CLI (`agy`), optional | the ⌘J assistant | no — see [The assistant](#the-assistant-j) |

No Xcode, no Rust, no Python install: the Python runtime (Pyodide) is a
dependency and is bundled into the app.

## Install from a fresh clone

```sh
git clone https://github.com/Mihirokte/prep.git
cd prep
./scripts/setup.sh
```

`setup.sh` checks the machine, installs anything missing from the table above
(asking first; pass `--yes` to skip the questions), runs `npm ci`, builds
`Prep.app` and copies it into `/Applications`. Add `--open` to launch it at
the end, or `--no-install` to build without touching `/Applications`. It is
safe to re-run.

If you already have Node, the same thing by hand:

```sh
npm ci                 # dependencies (downloads Electron and Pyodide, ~200 MB)
npm run package        # typecheck, build renderer + main, bundle → out/Prep-darwin-<arch>/Prep.app
npm run install-app    # copy into /Applications (replaces an earlier Prep.app only)
```

The app is built on your machine and never passes through a download, so
Gatekeeper does not quarantine it; it opens like any other app.

## Launch and relaunch

- Spotlight or Launchpad: **Prep**, or `open -a Prep` from a terminal.
- After pulling changes: quit Prep, run `./scripts/setup.sh` (or
  `npm run package && npm run install-app`), open it again. Your data is not
  part of the app bundle, so reinstalling never touches it.
- From source without installing: `npm run start`. Hot-reloading renderer:
  `npm run dev`.

## Keys

| | |
|---|---|
| ⌘K | search every lesson, problem, pattern and company |
| ⌘J | the assistant |
| ⌘[ / ⌘] | back / forward |
| ⌘⇧H | Overview |
| ⌘⌥S | show or hide the sidebar |
| ⌘Enter | check syntax (problem page) |
| / | focus search (DSA list) |

## Where your data lives

`~/Library/Application Support/Prep/` (also File › Reveal Data Folder):

- `data/content.json` — every course, lesson, drill, pack, pattern and
  company. The source of truth; created from `seed/content.json` on first
  launch.
- `data/history/` — a snapshot before every applied assistant change or
  content update (last 100), for Undo.
- `data/seed-state.json` — which bundled content revision this folder has.
  When a newer app ships newer lessons, records you have not touched are
  updated, records you edited or deleted are left alone, and anything you
  created is kept (see `src/shared/seedMerge.ts`).
- `progress.json` — problem status, notes and code.
- `agent/log.jsonl` — every assistant command, plan, error and applied change.
- `settings.json` (optional) — `{"agent": {"effort": "low" | "medium" | "high",
  "model": "...", "timeoutSec": 300, "agyPath": "/path/to/agy"}}`.

Progress can be exported and imported as JSON from the Overview page.

## The assistant (⌘J)

Commands go to the local [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli)
(`agy`) in headless print mode with a JSON schema; the app looks for it in
`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` and the login shell's
PATH, or at `agent.agyPath` in `settings.json`. Without it the rest of the app
is unaffected and the panel says so.

The CLI gets no tools. The app sends a compact index of every record plus the
full records the command names, and agy returns a plan in a small operation
language (create / update / delete / move / add_items / remove_items / link /
unlink). The plan is applied to an immutable copy and validated as a whole —
schemas, unique ids, every reference resolves; rejected plans go back to agy
with the errors (twice at most). Nothing changes until you press Apply, and
every applied plan can be undone.

The CLI also cannot reach the web, so the app reads web pages and GitHub
repositories for it. URLs in a command are read before the first call, and
agy can ask for more URLs (for example a directory or a file it saw in a
repository listing). A GitHub repository URL gives its description, licence,
README and a two-level directory listing. Only public http(s) hosts are read,
with a time and size limit. The panel lists every source a reply used. To see
what agy would get for a URL:

```sh
node scripts/run-ts.mjs scripts/read-sources.ts <url> [<url> ...]
```

A command too large for one plan (more than about four lessons) comes back
as slices. The app runs the slices three at a time and joins them into one
plan to review. Every lesson a plan writes must have well-formed diagram
blocks, or the plan goes back to agy with the errors.

## Content

Lessons are authored as markdown in `content-src/<course>/lessons/<id>.md`
(front matter, body, optional `===DEEPER===` section) and assembled into
`seed/content.json`:

```sh
node scripts/run-ts.mjs scripts/build-content.ts --course=ai [--check]
```

The script validates every diagram block, recomputes reading time and
replaces that course's chapters in the seed. After changing lessons, bump
`seed/revision.json` so existing installs pick them up. Lessons can embed, as
fenced blocks: `flow` (boxes and arrows with a travelling packet), `mermaid`
sequence diagrams, `stack` and `bars` charts, `steps`, `recall` (self-check
cards that feed the Review page) and `viz <scene-id>` (algorithm
walk-throughs). The syntax is specified in `content-src/ai/SPEC.md`.

### AI from Scratch (imported course)

`content-src/scratch/` holds the 542 lessons of
[AI Engineering from Scratch](https://github.com/rohitg00/ai-engineering-from-scratch)
(MIT), one chapter per phase. The files are generated: do not edit them by
hand. `scripts/import/from-scratch.ts` converts the upstream lessons. It
redraws mermaid flowcharts and state diagrams as `flow` blocks, keeps the
sequence-diagram subset Prep draws, turns each `quiz.json` into a recall
deck, points lesson links at Prep and other links at GitHub, and moves
Exercises, Key Terms and Further Reading into "Go deeper". To pull a newer
upstream version:

```sh
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/rohitg00/ai-engineering-from-scratch /tmp/aies
git -C /tmp/aies sparse-checkout set --no-cone /LICENSE '/phases/*/README.md' '/phases/*/*/docs/en.md' '/phases/*/*/quiz.json'
git -C /tmp/aies checkout main
node scripts/run-ts.mjs scripts/import/from-scratch.ts --src=/tmp/aies
node scripts/run-ts.mjs scripts/build-content.ts --course=scratch
```

Then bump `seed/revision.json`. `content-src/scratch/SOURCE.md` records the
imported commit and the source licence.

## Design

The visual language is the "Mihir" house style: Pixelta for display,
Pixel Operator for body, Determination for labels (fonts in
`src/renderer/assets/fonts/`; Pixel Operator is CC0, Determination is CC BY 3.0
and is credited in the sidebar). Paper and ink, 2px frames with stepped
notch corners, hard offset shadows, a 16px dot grid, red only for
interaction. Tokens live at the top of `src/renderer/prep.css`.

## Verify

```sh
npm run verify:seed    # seed/content.json: schemas, unique ids, every reference resolves,
                       # and that a content update keeps the user's edits
npm run verify:app     # builds, then drives the real app in a throwaway data dir:
                       # every route renders, Pyodide validator, progress persistence,
                       # ⌘K palette, assistant panel; screenshots → verify-report/
```

`verify:app` also audits the rendered UI against the visual-design principles
the design follows (Nielsen Norman Group, "5 Principles of Visual Design in
UX"), on every route at night and every screen type by day:

- **Scale:** text uses only the 12/16/24/40px steps, with at most one 40px title.
- **Contrast:** every drawn text meets WCAG AA against its resolved background
  (4.5:1, or 3:1 at 24px and up), and no text is faded with opacity.
- **Shape:** no rounded corners, blurred shadows, blur filters or gradients.
- **Balance:** page content is centered in its pane.

A self-test plants one violation of each kind first, so a clean result is not
vacuous. Hover states are outside the audit.

Two opt-in extensions of `verify:app`:

- `PREP_VERIFY_AGENT=1` runs ten real natural-language CRUD commands through
  agy (one through the panel UI), then undoes them all and checks the store is
  byte-for-byte the seed again. Needs agy and several minutes.
- `PREP_VERIFY_WEBSITE=<url>` compares the visible text of every route with a
  deployment of the web portal this app was extracted from.

Inside a sandboxed shell (an agent runner, some CI), add
`PREP_VERIFY_NO_SANDBOX=1`; macOS cannot nest sandboxes.

## Layout

```
scripts/
├── setup.sh             clean-machine setup → build → install
├── package.mjs          dist/ + seed/ → out/Prep-darwin-<arch>/Prep.app (@electron/packager)
├── install-app.mjs      → /Applications/Prep.app
├── build-main.mjs       main, preload and verify bundles (esbuild)
├── copy-pyodide.mjs     Pyodide runtime from node_modules into the renderer's public dir
├── build-content.ts     content-src/<course> → seed/content.json (validates diagram blocks)
├── verify-seed.ts       seed integrity and update semantics
├── make-icon.cjs        resources/icon.icns from icon.svg, rasterized by Electron
└── import/              optional: re-import the seed from a web-portal checkout (PORTFOLIO=…)
seed/content.json        the data every fresh install starts from
seed/revision.json       bumped when the bundled content changes
seed/legacy.json         record hashes of revision 1, so older installs can be updated safely
content-src/             lessons as markdown, by course
resources/               app icon
src/
├── shared/              pure core, used by main and renderer
│   ├── types.ts           the content model (areas, drills, packs, courses, patterns, companies)
│   ├── schema.ts          strict runtime schemas for every record
│   ├── validate.ts        whole-store integrity: schemas, unique ids, every reference resolves
│   ├── ops.ts             the assistant's operation language + all-or-nothing apply, cascades, previews
│   ├── seedMerge.ts       carry a newer bundled seed into an existing store without losing edits
│   ├── digest.ts          the assistant's context: compact index + records a command mentions
│   └── prompt.ts          instructions and the structured-output schema
├── main/                Electron main process (the only code with disk or process access)
│   ├── app.ts             window, prep:// protocol + CSP, navigation guards, menu, IPC
│   ├── store.ts           content.json + gzipped undo snapshots
│   ├── progress.ts        progress.json behind redux-persist
│   ├── agent.ts           plan → validate → repair loop, proposals, apply, undo, log
│   ├── agy.ts             the agy CLI adapter (argv only, never a shell)
│   └── verify.ts          the end-to-end verification entry
├── preload/             the typed window.prep bridge
└── renderer/            the UI (React 19, Tailwind v4, shadcn/Radix, CodeMirror)
    ├── model/             live model built from the store
    ├── routes/            one file per screen
    ├── components/        shell (sidebar, toolbar, assistant), palette, editor, markdown
    │   └── blocks/        flow / sequence / chart / steps / recall renderers
    ├── viz/               algorithm walk-through engine and the 29 scenes
    └── public/            validate-worker.mjs; pyodide/ is copied in at build time
```

## Origin

Prep began as a section of a personal website. This repository is the
standalone extraction: the data was imported once into `seed/content.json`,
the renderer is the same React code, and the main process, store, assistant
and verification are new. Nothing here reads from or builds against that site.
`scripts/import/` can re-import the seed from a checkout of it, but only when
`PORTFOLIO=/path/to/that/checkout` is given explicitly.
