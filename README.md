# Prep

A local Mac app for interview study and practice. Seven study areas — DSA
plus six courses (low-level design, system design, architecture, AI
engineering, production and ops, security) with 117 lessons — 241 drills, of
which 148 are Python problems with an editor and an offline syntax check, 29
pattern cards mapped to every problem, and company research with questions,
answer sketches and variants. Progress is kept on disk. An assistant (⌘J)
creates, reads, updates and deletes any record through natural-language
commands, with a diff to approve and one-click undo.

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

## Where your data lives

`~/Library/Application Support/Prep/` (also File › Reveal Data Folder):

- `data/content.json` — every course, lesson, drill, pack, pattern and
  company. The source of truth; created from `seed/content.json` on first
  launch.
- `data/history/` — a snapshot before every applied assistant change (last
  100), for Undo.
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

## Verify

```sh
npm run verify:seed    # seed/content.json: schemas, unique ids, every reference resolves
npm run verify:app     # builds, then drives the real app in a throwaway data dir:
                       # every route renders, Pyodide validator, progress persistence,
                       # ⌘K palette, assistant panel; screenshots → verify-report/
```

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
├── verify-seed.ts       seed integrity
├── make-icon.cjs        resources/icon.icns from icon.svg, rasterized by Electron
└── import/              optional: re-import the seed from a web-portal checkout (PORTFOLIO=…)
seed/content.json        the data every fresh install starts from
resources/               app icon
src/
├── shared/              pure core, used by main and renderer
│   ├── types.ts           the content model (areas, drills, packs, courses, patterns, companies)
│   ├── schema.ts          strict runtime schemas for every record
│   ├── validate.ts        whole-store integrity: schemas, unique ids, every reference resolves
│   ├── ops.ts             the assistant's operation language + all-or-nothing apply, cascades, previews
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
    ├── components/        shell (sidebar, toolbar, assistant), palette, editor, diagrams
    └── public/            validate-worker.mjs; pyodide/ is copied in at build time
```

## Origin

Prep began as a section of a personal website. This repository is the
standalone extraction: the data was imported once into `seed/content.json`,
the renderer is the same React code, and the main process, store, assistant
and verification are new. Nothing here reads from or builds against that site.
`scripts/import/` can re-import the seed from a checkout of it, but only when
`PORTFOLIO=/path/to/that/checkout` is given explicitly.
