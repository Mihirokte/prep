---
id: scratch-00-02-git-and-collaboration
chapter: scratch-00-setup-and-tooling
title: Git & Collaboration
minutes: 0
---
> Version control is not optional. Every experiment, every model, every lesson you build here gets tracked.

**Type:** Learn
**Languages:** --
**Prerequisites:** Phase 0, Lesson 01
**Time:** ~30 minutes

## Learning Objectives

- Configure git identity and use the daily workflow of add, commit, and push
- Create and merge branches for isolated experiments without breaking main
- Write a `.gitignore` that excludes model checkpoints and large binary files
- Navigate the commit history with `git log` to understand project evolution

## The Problem

You're about to write hundreds of code files across 20 phases. Without version control you will lose work, break things you can't undo, and have no way to collaborate with others.

Git is the tool. GitHub is where the code lives. This lesson covers what you need for this course and nothing more.

## The Concept
```mermaid
sequenceDiagram
    participant WD as Working Directory
    participant SA as Staging Area
    participant LR as Local Repo
    participant R as Remote (GitHub)
    WD->>SA: git add
    SA->>LR: git commit
    LR->>R: git push
    R->>LR: git fetch
    LR->>WD: git pull
```
Three things to remember:
1. Save often (`git commit`)
2. Push to remote (`git push`)
3. Branch for experiments (`git checkout -b experiment`)

## Build It

### Step 1: Configure git
```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```
### Step 2: The daily workflow
```bash
git status
git add file.py
git commit -m "Add perceptron implementation"
git push origin main
```
### Step 3: Branching for experiments
```bash
git checkout -b experiment/new-optimizer

# ... make changes, commit ...

git checkout main
git merge experiment/new-optimizer
```
### Step 4: Working with this course repo

You can't push to the course repo itself — only maintainers have write access. Fork it on GitHub first (the Fork button, top right) so `origin` points at your own copy:
```bash
git clone https://github.com/YOUR-USERNAME/ai-engineering-from-scratch.git
cd ai-engineering-from-scratch

git checkout -b my-progress
# work through lessons, commit your code
git push origin my-progress
```

## Use It

For this course, you need exactly these commands:

| Command | When |
|---------|------|
| `git clone` | Get the course repo |
| `git add` + `git commit` | Save your work |
| `git push` | Back it up to GitHub |
| `git checkout -b` | Try something without breaking main |
| `git log --oneline` | See what you've done |

That's it. You don't need rebase, cherry-pick, or submodules for this course.

Source: [AI Engineering from Scratch, phase 0, 02-git-and-collaboration](https://github.com/rohitg00/ai-engineering-from-scratch/tree/3f9715c62a3bedcffb68a260f1a65ee2dd9cc10a/phases/00-setup-and-tooling/02-git-and-collaboration), with its code and notebook. MIT licence, (c) Rohit Ghumare and contributors.

## Check yourself

```recall
Q: What does 'version control' primarily help you do?
A: Track changes to files over time and collaborate with others. Version control systems like git track every change made to files, allowing you to revert to previous states and collaborate with others on the same codebase.
Q: What is a 'repository' in the context of software development?
A: A collection of files and their complete change history managed by version control. A repository (repo) is a directory tracked by git that contains all project files along with the full history of changes made to those files.
Q: What is the correct sequence for saving and backing up your work in git?
A: git add, git commit, git push. First you stage changes with 'git add', then save a snapshot with 'git commit', then upload to the remote with 'git push'. This is the daily workflow.
Q: What does 'git checkout -b experiment/new-optimizer' do?
A: Creates a new branch named experiment/new-optimizer and switches to it. The '-b' flag creates a new branch with the given name and immediately switches to it, allowing you to experiment without affecting the main branch.
Q: Why should you add '.pt', '.pth', and '.safetensors' to your .gitignore?
A: They are model checkpoint files that are too large for git and can be re-generated. Model checkpoint files (.pt, .pth, .safetensors) are often gigabytes in size. Git is not designed for large binary files, so these should be excluded and re-generated or stored separately.
```

===DEEPER===
## Exercises

1. Fork this repo, clone your fork, create a branch called `my-progress`, make a file, commit it, push it
2. Create a `.gitignore` that excludes model checkpoint files (`.pt`, `.pth`, `.safetensors`)
3. Look at the commit history of this repo with `git log --oneline` and read how lessons were added

### Hints

**Exercise 1.** Click Fork on GitHub, then `git clone` the URL of your own fork. After `git push -u origin my-progress`, open your fork on GitHub and confirm that the branch list shows `my-progress` with your file.

**Exercise 2.** Add one pattern per extension, such as `*.pt`, to a `.gitignore` file in the repository root. Create an empty file with each extension and run `git status`; none of them may appear in the list of untracked files.

**Exercise 3.** Run `git log --oneline` and then `git log --oneline -- phases/00-setup-and-tooling` to show only the commits that changed this phase. Pick one commit and run `git show --stat <hash>` to see which lesson files it added.

## Key Terms

| Term | What people say | What it actually means |
|------|----------------|----------------------|
| Commit | "Saving" | A snapshot of your entire project at a point in time |
| Branch | "A copy" | A pointer to a commit that moves forward as you work |
| Merge | "Combining code" | Taking changes from one branch and applying them to another |
| Remote | "The cloud" | A copy of your repo hosted somewhere else (GitHub, GitLab) |
