---
name: handover
description: Empty a session into files before its context goes — decide with the user what gets written down, write it, and only then say what the next session needs. Use when the user says "handover", "compact", "wrap this up" or "start clean". Do NOT use to record one thing, which decides one destination and is todo.
---

# Emptying a session

**A prompt is not storage.** What this session learned goes in a file that a
future session opens by itself. What a prompt carries is only what is true of
this moment: which branch, what is uncommitted, what is running, what is next.
All of that is worthless in a week.

**Decide what gets written first.** Draft the prompt from what is left over,
never from what was interesting.

Two paths. `/compact` writes its own summary of the conversation, so step 4 has
no reader on that path and step 4b replaces it.

| next | steps |
| --- | --- |
| `/clear`, or a new session | 1, 2, 3, 4, 5 |
| `/compact` | 1, 2, 3, 4b, 5 |

## 1. Inventory, by destination

This fires when the context is nearly gone, so the early half of the session is
the half you recall worst. Reconstruct before you list:

```sh
git status -sb
git log --oneline -15          # what this session did, not main..HEAD
git diff --stat $(git merge-base main HEAD)..HEAD | tail -3
```

Then sort each item by **where it belongs**, not by how interesting it was.
`/todo` owns the destinations: invoke it rather than deciding here. Two things
it does not own:

| what it is | where it goes |
| --- | --- |
| state: branch, commits, what is green, what is running | the prompt, or the compact paragraph |
| the next instruction | the user writes it, step 5 |

**One question makes it mechanical.** For each item: *if a future session needed
this and I were gone, where would it look?* A file, then it goes in the file.
Nowhere, because it only matters for the next hour, then the prompt. **"It would
ask me" is the item most likely to be dropped and the one that must be written.**

## 2. Put it to the user, item by item

Not a summary. A list of decisions, each with where you propose to put it, as an
`AskUserQuestion`: keep or drop, your answer first and labelled as the
recommendation, and per option the argument for it **and the strongest one
against, including against the one you recommend.**

**The destination is not part of the question.** Step 1 settled it.

Say plainly what you would drop. A session produces more observations than are
worth keeping and the author is the worst judge of which.

## 3. Write the ones that were kept

Through `precommit`, like anything else. Being at the end of a session does not
make a doc change cheaper to get wrong.

**Finish this before drafting anything.** A prompt written first absorbs
whatever was inconvenient to file.

## 4. Draft the prompt — new-session path

One fenced block, nothing else inside it, so it is copied in one gesture. Use a
four-backtick fence: a three-backtick one closes early on the first fenced block
inside the prompt.

- **Where the work is.** Branch, what is committed and what is not, which suites
  were last green. Paste step 1's output; from memory this is the one part the
  next session cannot check.
- **What is in flight.** A running agent, a branch waiting to merge.
- **What the repo already answers**, by pointing: `CLAUDE.md`, `CONTRIBUTING.md`,
  `TODO.md`, the memory directory, the tracker artifact. If one of them is stale,
  fixing it was step 3.
- **What the next session should know before it judges the work.** A claim of
  yours that is unmeasured, a round that is repairing its own repairs, a range
  too large to read at once. This is the only part with no file.
- **The next instruction**, from step 5. Not your guess at it.

**A prompt that explains something has a step-3 failure in it.** "Watch out for
X" means X has a home and you skipped it.

## 4b. Write the compact paragraph — compact path

One paragraph, and **only what has no file may go in it.** Nothing prints a
standing list here, so the paragraph carries itself: state has files, the repo
answers its own shape, and a sentence repeating either spends the space that was
actually at risk.

What is left is a judgement about *this* session. Hand over the line to type and
nothing else:

```sh
/compact <the paragraph>
```

**A paragraph that is only state means there is nothing to type.** Say steps 1
to 3 hold it, and stop. Inventing a judgement to fill this is worse than leaving
it empty.

## 5. Ask for the next instruction

Both paths. An `AskUserQuestion` in step 2's form.

**Where the answer lands differs.** On the new-session path it is the last
bullet of step 4. After a compact it goes in `TODO.md`, because a paragraph
nobody re-reads is not where an instruction belongs.

**An answer that changes direction sends you back to step 3.** Ending a session
is a natural moment to change direction, and whoever has been inside the work is
least able to see that.
