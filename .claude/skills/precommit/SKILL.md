---
name: precommit
description: Run the checklist before committing or merging — read the diff, lint, typecheck, the unit suite, the e2e specs the change touches, then report and commit. Use when the user says "commit", "committen", "precommit", "merge" or "mergen", and when you run yarn lint, yarn typecheck, yarn test or yarn test:e2e to find out whether your work is finished. Do NOT use to decide which tests a change needs — that is test.
---

# Precommit

## While you work

**`git add` before you mutate anything.** `git checkout` naming a path restores
from the *index*, which on an unstaged file is HEAD — so the command undoing one
mutation deletes everything else you wrote in that file.

**A scripted edit leaves no name behind.** After any edit you did not type line
by line:

```sh
git diff --stat -- <the files you named>          # empty means nothing happened
git diff | grep '^-' | grep -E 'const |function |export '   # what left, by name
git diff | grep -E '^[-+][[:space:]]*(//|\*)'     # comments it ate or spliced
```

A name in the second list you did not decide to remove is one you did not decide
to remove. A `+` comment that does not follow its `-` neighbour is a banner that
now names something else. → [WHY: what a script moved](./references/what-a-script-moved.md)

**Writing or changing a test?** Its own skill: **`test`**.

---

## 1. Read the diff

```sh
git status --porcelain    # untracked files too — they are in neither diff
git diff
git diff --staged
```

Read **every** changed file, and untracked files in full: a new file has no diff,
and is where a fresh copy of something the project already owns lands.

Then, against `CONTRIBUTING.md` *Code style* and `CLAUDE.md`:

- **A store selector returning an object** is a whole-store subscription wearing
  a selector's clothes. One selector per field.
- **`src/shared` importing from `src/main`** — the one layer that may not reach
  back.
- **An interactive element with no `data-testid`** — the e2e suite addresses the
  UI through them.
- **A new IPC channel** — a name in `IPC_CHANNELS`, a type in `IpcHandlerSpec`, a
  one-line handler. A handler carrying logic belongs in the module it calls.
- **Changed a persisted shape?** It needs a version and a migration. `partialize`
  in the store says whether the shape is persisted at all.

## 2. `yarn lint && yarn typecheck && yarn test`

About 75 seconds together, most of it typecheck. Run all three: `yarn test` does
not typecheck, so a wrong annotation passes it.

```
const n: number = 'a string'    # vitest: 1 passed
                                # tsc:    error TS2322
```

## 3. The e2e specs this change touches

```sh
npx electron-vite build && npx playwright test e2e/specs/01-main/<nn>-<name>.spec.ts
```

Pick them by what the change reaches, not by name. A change to the server grid
touches `03-server-config`, `04-add-register-modal` and `08-polling-generators`;
a change to writing touches `09-write-operations`; a change to config shapes
touches `05-file-io` and `14-client-config-io`.

## 4. The full suite, once

`yarn test:e2e` at the end of a branch, not per commit. It builds first and runs
for minutes, and running it per commit is how a branch stops being worked on.

**A packaging or dependency change is measured on the artefact**, never on
`package.json`: `asar list` says what ships.

## 5. Report, then decide what needs asking

**Report what every step above produced.** A waiver covers the permission, never
the checklist.

| what you are about to do | ask first? |
| --- | --- |
| `git commit` | no |
| `git push`, `gh` | **yes** — the line is whether it leaves the machine |
| merge | **yes**, and show the squash message first |

## 6. Commit

Commit the files you changed. **Never `git add -A` without reading
`git status --porcelain` first** — it takes build output, editor droppings and
anything a tool left behind.
→ [WHY: what git add -A took](./references/what-git-add-a-took.md)

Conventional Commits, lowercase, no full stop. `feat` is new functionality,
`fix` is something that was broken, `refactor` is the same behaviour in
different code, `test` is test-only, `docs` is docs-only, `chore` is tooling.
Mean what you say.

Explain **why**, and if something was fixed, what the defect was and how it was
verified. **No `Claude-Session:` trailer** — the message ends at the prose.

`git commit -F -` reads stdin, which is how a multi-paragraph message gets in
without a shell mangling it.

**Re-run every pasted command after the last edit, immediately before
`git commit`.** A figure is only true of the tree it ran against, and the way to
get this wrong is to measure, keep working, and commit the measurement beside the
change that moved it.

## Splitting one change into several commits

**Never split through the working tree.** `git stash` then `git checkout -- .`
restores every unstashed file from HEAD, and that work is gone. `git stash` with
nothing to stash is a no-op that still succeeds, so the `pop` after it applies
whatever was already on the stack.

Build the commit in the **index**: `git add -p`, or `git apply --cached` for a
hunk. Both write only the index, so a mistake cannot destroy anything.

To move uncommitted work to another branch you need no stash at all:
`git checkout -b <branch>` carries it.

## The prose pass

Its own skill: **`prose`**.

**Every commit hands over to it, once, after the message is drafted and before
`git commit`.** Unconditionally — no "if it makes a claim", because deciding
whether your own sentence makes a claim is the judgement that fails.

**What it covers is the whole diff, not the message.** A false sentence in a code
comment and a false sentence in a commit message are the same defect, and the
comment is the one that survives.
