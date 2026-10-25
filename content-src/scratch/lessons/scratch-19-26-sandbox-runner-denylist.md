---
id: scratch-19-26-sandbox-runner-denylist
chapter: scratch-19-capstone-projects
title: Capstone Lesson 26: Sandbox Runner with Denylist and Path Jail
minutes: 0
---
> The verification gate decides whether a tool call should run. The sandbox decides what happens when it does. This lesson ships a subprocess runner that refuses dangerous executables, refuses dangerous argv shapes, jails every file path to a project root, truncates oversized output, and kills runaway processes on a wall-clock timeout. It is the second of two layers that sit between the model and the operating system.

**Type:** Build
**Languages:** Python (stdlib)
**Prerequisites:** Phase 19 · 25 (verification gates and observation budget), Phase 14 · 33 (instructions as constraints), Phase 14 · 38 (verification gates)
**Time:** ~90 minutes

## Learning Objectives

- Build a `Sandbox` class wrapping `subprocess.run` with timeout, capture, and truncation.
- Refuse a command by name against a denylist and by structure against an argv inspector.
- Refuse any path argument that resolves outside a declared project root.
- Refuse shell metacharacters when shell mode is off.
- Return a structured `SandboxResult` that downstream observability and the eval harness can ingest.

## The Problem

A coding agent that can shell out can install backdoors, exfiltrate keys, brick a developer laptop, and rack up a cloud bill in a single turn. The least costly defense is to not give it shell. The second least costly is a sandbox that says no to a precise list of patterns.

Three classes of failure recur in agent traces.

The first is dangerous executables. A model under pressure to fix a path issue will try `sudo`, `chmod -R 777`, `rm -rf`, `mkfs`, `dd`. None of these belong in an agent run. The denylist catches them by name and by alias.

The second is argv tricks. A model that has been told no shell will pipe an attack through an interpreter: `python3 -c "import os; os.system('rm -rf /')"`, `bash -c '...'`, `node -e '...'`, `perl -e '...'`. The sandbox needs to know that any interpreter run with a `-c`-like flag is just a shell call with extra steps.

The third is path escape. The model is told to read `./src/main.py` and instead reads `../../etc/passwd`. The sandbox jails every path argument by resolving it through `os.path.realpath` and asserting the prefix.

The sandbox is not a security boundary in the operating system sense. A determined attacker with code execution can still break out. The sandbox is a development-time guardrail: it makes the common failure modes loud and stops the agent from doing damage out of sheer ineptitude.

## The Concept
```flow
dir: TB
Call: ToolCall already passed gate chain | step
Run: Sandbox.run() | tool
S1: 1. resolve executable against denylis... | step
S2: 2. inspect argv interpreter -c, shell... | tool
S3: 3. resolve path-like arguments agains... | step
S4: 4. spawn subprocess capture, wall-clo... | step
S5: 5. truncate stdout/stderr to max_outp... | step
Result: SandboxResult exit_code, stdout, stde... | step
Call -> Run
Run -> S1
S1 -> S2
S2 -> S3
S3 -> S4
S4 -> S5
S5 -> Result
```
The sandbox has four refusal axes: name, argv, path, structure. Each axis is a pure function of the call, no subprocess yet. The subprocess only spawns after every axis has passed.

The `SandboxResult` exit codes are the conventional ones: 0 success, non-zero failure, plus three sentinel codes for denied (-100), timed_out (-101), and truncated (the exit code is the real one, with a flag set). Downstream lessons read this structured result rather than parsing stderr.

## Architecture
```flow
dir: LR
Harness: AgentHarness lesson 20-25 | step
Sandbox: Sandbox denylist path jail argv inspe... | tool
Popen: subprocess.Popen | step
Result: SandboxResult | step
Harness -> Sandbox : call
Sandbox -> Popen : exec
Sandbox -> Result
```
The denylist is a frozenset of executable basenames. Aliases (`/bin/rm`, `/usr/bin/rm`) all resolve to the same basename. The argv inspector knows the interpreter shape: any argv where argv[0] is an interpreter and any later arg starts with `-c` or `-e` is denied. Shell metacharacters (`;`, `|`, `&`, `>`, `<`, backticks, `$()`) cause refusal when the call did not explicitly request a shell.

The path jail is the most subtle piece. The sandbox accepts a `project_root` at construction. Any argument that looks like a path (contains `/` or matches an existing file) is normalized through `os.path.realpath`, then checked against the realpath of the project root. If the resolved target is not under the root, refusal. Symlink escape attempts (a symlink in the project root that points outside) are blocked by checking realpath, not the literal path.

## What you will build

The implementation is `main.py` plus a tests dir.

1. `SandboxResult` dataclass: exit_code, stdout, stderr, truncated, timed_out, denied, reason, duration_ms.
2. `SandboxConfig` dataclass: project_root, max_output_bytes, timeout_seconds, denylist, interpreter_block.
3. `Sandbox` class: `run(argv, *, shell=False, cwd=None)` returns a `SandboxResult`.
4. Internal refusal helpers: `_check_executable_denylist`, `_check_argv_interpreter`, `_check_shell_metachars`, `_check_path_jail`.
5. Output truncation with a clear `truncated` flag and a marker line in the captured stream.
6. Demo at the bottom: a sequence of legitimate and adversarial calls. Each is shown with its result.

The sandbox uses `subprocess.run` with `shell=False` by default and `capture_output=True`. The wall-clock timeout uses the `timeout` argument; on `TimeoutExpired`, the sandbox kills the process group and synthesizes a SandboxResult.

## Why this is not a real sandbox

The lesson sandbox does not use namespaces, cgroups, seccomp, gVisor, Firecracker, or any kernel-level isolation. Anything the subprocess can do, the sandbox can do. The protection is structural: the agent is denied the most common dangerous invocations, and the loud refusal goes into observability instead of silently running.

For production agents you layer on top: run inside an unprivileged Docker container, run inside a microVM, drop capabilities, mount the project root read-only and a scratch dir read-write, set ulimit on memory and CPU, scrub the environment to a known-safe whitelist. Lesson 29 does some of this. Operating-system isolation is out of scope for this lesson.

## Running it
```bash
cd phases/19-capstone-projects/26-sandbox-runner-denylist
python3 code/main.py
python3 -m pytest code/tests/ -v
```
The demo creates a temp directory, drops a clean file into it, then runs a battery of calls. Legal calls succeed. Denied calls return SandboxResult with `denied=True` and a reason. Timeouts return `timed_out=True`. Truncation sets `truncated=True`. The demo prints a JSON table of outcomes and exits zero.

## How this composes with the rest of Track A

Lesson 25 produced the gate chain. Lesson 26 is the executor that runs after a gate ALLOW. Lesson 27's eval harness compares the sandbox results against the expected exit-code per task. Lesson 28 emits a `gen_ai.tool.execution` span around each `Sandbox.run` invocation. Lesson 29's end-to-end demo wires a real coding agent through both layers.

Source: [AI Engineering from Scratch, phase 19, 26-sandbox-runner-denylist](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/19-capstone-projects/26-sandbox-runner-denylist), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: Before reading the lesson: what is the strongest reason a sandbox checks argv shapes for interpreter invocations like python3 -c?
A: An interpreter with -c is a shell call by another name and bypasses the executable denylist. python3 -c, bash -c, node -e, and friends are functionally identical to giving the model a shell. Blocking the executable name is not enough.
Q: The sandbox is configured with project_root=/work. A path argument arrives as ./src/main.py. How is the jail check performed?
A: os.path.realpath of the joined absolute path is checked for a /work prefix. realpath resolves symlinks. A literal prefix check is bypassed by a symlink inside the project root pointing outside. realpath plus prefix-or-equal is the safe check.
Q: A SandboxResult comes back with denied=True, timed_out=False, exit_code=-100. What is the canonical interpretation?
A: The sandbox never spawned the subprocess; the call was refused before exec. The sentinel exit_code -100 paired with denied=True means the sandbox short-circuited before subprocess.run was called.
Q: Why does the sandbox prefer shell=False by default and refuse shell metacharacters?
A: Shell parsing exposes the entire shell DSL to the model, which is the surface the sandbox is trying to shrink. shell=True turns argv into a shell-interpreted string. Pipes, redirects, command substitution, and globbing all become available. The sandbox cannot meaningfully refuse a payload once shell parsing runs.
Q: You want to add a per-process memory limit to the sandbox. The lesson's sandbox does not implement this. What is the correct next step?
A: Use os.setrlimit(RLIMIT_AS) in a preexec_fn passed to subprocess.run. subprocess.run accepts preexec_fn (POSIX) or a similar mechanism. setrlimit(RLIMIT_AS) caps the address space of the child. The sandbox in this lesson does not ship this; lesson 29's end-to-end demo discusses how to layer container-level limits on top.
Q: The model invokes the sandbox with argv=['cat', 'src/./src/main.py']. The file exists under project_root. Should the call pass the path jail?
A: Yes: realpath collapses src/./src to src and the resolved path is inside project_root. realpath normalises the path. The sandbox does not blanket-refuse . tokens; it checks the resolved target. This is intentional: legitimate paths sometimes go through . legitimately.
```
