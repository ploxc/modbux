---
name: todo
description: Route something you want to record to the place that holds it — TODO.md, a GitHub issue, the memory directory, or the plan in flight. Use before writing down a task, a reason or a defect, and whenever the user says "note that", "write that down" or "add a TODO". Do NOT use to decide whether a change needs a test — that is test.
---

# Todo

## First: is it yours to fix instead?

Writing a defect down converts it into a backlog item, and backlog items feel
handled. Before choosing a place, choose whether there is one:

- **the fix is small** — do it in this commit, and record nothing
- **larger** — tell the user, and let them decide
- **the user deferred it** — now it goes somewhere, and the rest of this decides where

**The tell is the sentence you are about to write.** *"Pre-existing"*, *"older
than this branch"*, *"not mine"*, *"pulled in by proximity"*. Each of those can
be true, and none of them answers whether the fix is small.

## Then: state, or history?

| what you are writing | where it goes |
| --- | --- |
| something to **do**, on this branch or the next | `TODO.md`, one line |
| something a **user** would recognise as a bug or a request | a GitHub issue |
| **why** — a decision, a measurement, an approach that failed | the memory directory |
| a **preference** the user stated, or how they want to work | the memory directory, never the repository |
| something already in the **plan being executed** | there, and not twice |
| what a user can now **do** | `CHANGELOG.md`, at the release |

**The tell is the tense.** *"Enable `require-await`"* is a task. *"Two handlers
stayed async because reading the version off the store took their only await,
and lint has the rule off"* is a record. If your sentence explains, it is not a
task, however true it is.

**The other tell is length.** A task is one line, maybe three. The moment you
reach for a table, a code block, or a paragraph beginning "the cause is", you
are writing a record, and the memory directory is where records go.

## `TODO.md` is not a record and not shared

It is untracked. It does not survive a clone, it does not reach anyone else, and
it does not move with a branch. So:

- **Anything another person needs** goes to a GitHub issue instead. A note to
  yourself is the only thing this file holds.
- **A symbol name is authoritative, a line number is a hint.** Name the symbol;
  a line number goes stale on the next edit above it.
- **A finished item is deleted, never ticked.** A ticked box is history, and
  history in a task list is what makes a task list stop being read.

## Before adding a paragraph to something already there

The destination looks settled, so the test above gets skipped — and that is how
a task list turns into a history one paragraph at a time.

Read the whole entry first. If your addition explains rather than instructs,
the entry stays one line and the explanation goes to memory.
→ [WHY: the explanation that ate the task](./references/the-explanation-that-ate-the-task.md)

## What the user says goes where they say

"Note that" and "write that down" name the act, not the destination. Route it by
the table, then say in one line where it landed and why, so a wrong call is
cheap to correct.
