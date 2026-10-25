---
id: scratch-19-54-paper-writer
chapter: scratch-19-capstone-projects
title: Paper Writer
minutes: 0
---
> A LaTeX skeleton is a contract between the researcher and the typesetter. If the contract is broken the document does not compile, and the failure is loud. Build the skeleton first, then fill it.

**Type:** Build
**Languages:** Python
**Prerequisites:** Phase 19 lessons 50-53
**Time:** ~90 minutes

## Learning Objectives

- Treat a research paper as a structured artifact with a known section graph, not a freeform document.
- Generate a LaTeX skeleton that declares its abstract, sections, figure slots, and bibliography keys before any prose is written.
- Inject figures from experiment outputs (paths and captions) into the skeleton through a deterministic slot mechanism.
- Wire a mocked prose generator that fills each section from a structured outline so the harness is testable without a model.
- Emit a single `paper.tex` plus a `references.bib` plus a manifest that lists every figure referenced and every citation used.

## Why a skeleton first

A draft that starts as prose accumulates structural debt. The introduction grows three paragraphs that should be in related work. A figure gets referenced before it is defined. The bibliography ends up with three keys for the same paper. By the time the author notices, the rewriting cost is higher than the writing cost.

A skeleton inverts that. The structure is declared up front as data. Sections are slots with names and order. Figures are slots with ids and captions. Bibliography keys are declared at the top with the entries they point at. Prose is generated into those slots one at a time. The harness can validate, before any prose is written, that every figure has a slot, every citation has an entry, and every section appears in the table of contents.

This is the same discipline that earlier lessons applied to plans, tool calls, and traces. The structure is the contract.

## The Paper shape
```flow
dir: TB
Paper: Paper | step
Meta: metadata | step
Sections: sections list | step
Figures: figures list | step
Bib: bibliography list | step
Title: title | step
Authors: authors | step
Abstract: abstract | step
Sec1: Section: id, title, body, cites | step
Fig1: Figure: id, path, caption, label | step
Entry1: BibEntry: key, fields | step
Paper -> Meta
Paper -> Sections
Paper -> Figures
Paper -> Bib
Meta -> Title
Meta -> Authors
Meta -> Abstract
Sections -> Sec1
Figures -> Fig1
Bib -> Entry1
```
Every field is plain Python data. The renderer is a pure function from `Paper` to a LaTeX string. The harness can introspect the paper before rendering: count sections, list missing figure files, check that every `\cite{key}` has a matching `BibEntry`.

## The render contract

The renderer guarantees three properties. First, every figure slot in the skeleton emits a `\begin{figure}` block with a stable label of the form `fig:<id>`. Second, every section emits a `\section{}` with a stable label of the form `sec:<id>` so cross-references work. Third, the bibliography emits a `\bibliography` block whose `references.bib` contains exactly the entries declared on the paper, no more and no fewer.

Violating any of these is a render error, not a warning. The skeleton is the contract; a render that silently drops a figure is a contract break.

## Figure injection from experiments

The earlier lessons in this track produced experiment outputs as JSON manifests. Each manifest carries a list of artifacts with paths and short captions. The paper writer reads that manifest and produces `Figure` records.
```flow
dir: LR
Exp: experiment.json | step
Reader: read_experiment_manifest | step
Figs: Figure list | step
Paper: Paper.figures | step
Render: render_latex | step
Out: paper.tex | step
Exp -> Reader
Reader -> Figs
Figs -> Paper
Paper -> Render
Render -> Out
```
The injection is deterministic. Figure ids are derived from the experiment name plus a monotonic counter. Captions come from the manifest. Paths are normalised relative to the paper's output directory so the LaTeX compiles even when the experiment outputs sit elsewhere on disk.

## The mocked prose generator

The lesson does not call a model. A `MockProseGenerator` reads an outline shape and emits prose deterministically. The outline shape is one short string per section. The generator expands that string into two short paragraphs with the section title woven in. The generated prose name-drops figures and citations exactly when the outline declares them.

This is enough to test every behaviour of the writer. A real implementation would swap the generator for a model call. The harness around it does not change. That is the value of declaring the prose generator as a callable: the test substitutes a deterministic one, production substitutes a model one, the rest of the pipeline is identical.

## The manifest output

The writer emits three files into the output directory.
```flow
dir: TB
Writer: PaperWriter.write | step
Tex: paper.tex | step
Bib: references.bib | step
Man: manifest.json | step
F: figures referenced | step
C: citations used | step
S: sections rendered | step
Writer -> Tex
Writer -> Bib
Writer -> Man
Man -> F
Man -> C
Man -> S
```
The manifest is what a downstream evaluator or critic loop reads. It does not parse LaTeX; it reads the manifest. The next lesson, the critic loop, takes this manifest as input and produces a feedback list. That is why the manifest is part of the contract and the LaTeX is not.

## Validation gates

The writer runs four gates before writing any file.

1. Every figure id is unique within the paper.
2. Every section's `cites` field references a bibliography key that is declared on the paper.
3. The abstract is non-empty.
4. The title is non-empty.

A failed gate raises `PaperValidationError` with a precise reason. The harness surfaces the reason as the failure mode. There is no partial write: either all three files are emitted, or none.

## How to read the code

`code/main.py` defines `Paper`, `Section`, `Figure`, `BibEntry`, `PaperValidationError`, `MockProseGenerator`, `PaperWriter`, and a `render_latex` function. The `write` method takes an output directory and emits `paper.tex`, `references.bib`, and `manifest.json`. The `read_experiment_manifest` helper converts a list of experiment manifests into `Figure` records.

`code/tests/test_paper_writer.py` covers: skeleton render with no sections, full render with two sections and two figures, missing-citation gate, duplicate-figure-id gate, manifest content, and the LaTeX-string contract (every section emits a `\section{}`, every figure emits a `\begin{figure}`).

## Going further

Two extensions a real implementation will want. First, multi-format render: the same `Paper` shape compiles to Markdown for blog posts and HTML for previews. The renderer becomes a strategy on `Paper`. Second, citation enrichment: the writer fetches BibTeX entries from a citation key, given a local cache of DOIs. Both add value, both can be added without touching the skeleton contract.

The skeleton is the bet. Sections, figures, and citations declared as data, prose generated into slots, manifest emitted alongside the LaTeX. Every other improvement composes on top.

Source: [AI Engineering from Scratch, phase 19, 54-paper-writer](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/19-capstone-projects/54-paper-writer), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Why does the writer declare sections, figures, and citations as data before any prose is written?
A: Because the structure is the contract: the harness can validate completeness before prose generation. Structure-first lets the harness validate uniqueness, citation coverage, and figure coverage before invoking the prose generator. The skeleton is the contract.
Q: What does the figure-injection step produce from an experiment manifest?
A: A list of Figure records with stable ids and paths normalised to the paper directory. read_experiment_manifest returns Figure records. Ids are deterministic, paths are normalised, captions come from the manifest.
Q: Which validation failure raises PaperValidationError before any file is written?
A: A section that cites a key not declared in the bibliography. Missing bibliography keys, duplicate figure ids, empty title, empty abstract, and unknown figure refs all raise PaperValidationError. Existence on disk is not enforced because the LaTeX compiler enforces it later.
Q: Why is the prose generator a callable injected into PaperWriter rather than a method on it?
A: Because tests can swap a deterministic MockProseGenerator for a model call without touching the writer. The writer takes the prose generator as a dependency. The test substitutes MockProseGenerator. Production substitutes a model call. The writer is unchanged.
Q: What three files does PaperWriter.write emit on success?
A: paper.tex, references.bib, manifest.json. paper.tex is the LaTeX source. references.bib is the bibliography. manifest.json is the structured artifact the critic loop reads next.
Q: Why is the manifest part of the writer's contract instead of just the LaTeX file?
A: Because downstream tooling (critics, dashboards) reads structured manifests, not LaTeX. The manifest is a stable interface for downstream stages. Critics and dashboards inspect manifest.json. LaTeX is the human-readable artifact, not the machine interface.
```
