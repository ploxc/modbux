---
name: prose
description: Measure a sentence you just wrote against the thing it describes, then prune the block it lands in. Use after writing or editing a code comment, a commit message, a CHANGELOG entry, an issue reply, or any markdown paragraph, and before adding to one that already exists — reflowing a sentence that states a measurement counts as writing it. Do NOT use as a tone pass — a sentence that passed its check is finished.
---

# Prose

Is it code? Skip. Everything else gets read back sentence by sentence before it
stands, and **a claim you did not measure does not stay.**

## The trigger

You just wrote a sentence containing one of these. Run its command now.

| the sentence contains | the command |
| --- | --- |
| a quoted message — a snackbar, an error, test output | run it and copy the line out of the output |
| a number — including "both", "all three", "each", "the only remaining" | the command that counts it, pasted with its output |
| a reference — a file, a symbol, a commit | `git show <ref>:<file>` and `grep -rn '<symbol>' src/` |
| a cause — "because", "this closes", "it is missing X" | `grep -rn '<symbol>' src/` over every caller, and show both sides |
| a date or an order — "pre-existing", "added after", "still" | `git log -S '<text>' --format='%h %ad %s' --date=short` |
| a qualifier — "mostly", "except", a parenthesis | read the hedge back; ask whether the claim in front survives |
| the shape of the code — "X now calls Y", "the copy is gone" | `grep` and `git diff`, never a green suite |
| **a command the reader is told to run** | run it, and read its output the way its reader will |
| **you are adding to a comment or a section that already exists** | read the whole block first — see *read the block* below |

**A fact from outside this repository has no command here.** Cite the source, or
cut the sentence.

To quote something the app says, find it rather than remember it:

```sh
grep -rn "message:" src/main src/renderer/src --include=*.ts --include=*.tsx | grep -v __tests__
```

## The command you paste

Four ways it is still wrong:

- **It did not run.** Read the exit code. `yarn lint | tail -5` prints nothing
  useful when lint failed on a file you did not open.
- **It answered a different question.** Read your sentence's noun, read what came
  back, and say whether they are the same set.
- **It could not have contradicted you.** Searching for the fix never returns a
  site that needs it. Search the population — every call, every caller.
- **It matched the sentence you were writing.** Run the search before you paste
  it into a file and again after, and see whether the number moved.

## Figures

→ [WHY: figures](./references/figures.md)

**No hand-written figure goes into prose.** Not a careful one, not a checked one,
not one you just measured.

**The default is not to count.** A sentence with no number in it is the one to
write unless counting earns its place. *"The suite is green"*, *"its callers are
`AddButtons`, `DeleteButton` and the edit submit"* — neither can go stale.

**"Did you measure it" is the wrong gate**, and it passes the failures. A
measured figure fails when **the command counted one set and the sentence names
another**. So the question is not *did I run it* but **which set did the command
count, and is that the noun in the sentence?**

**A figure about work in progress does not go in at all** — steps done, files
left, lines in your own diff. It is a prediction, and it is wrong before the
commit lands.

**Editing a sentence that states a measurement is writing it.** Reflowing or
trimming does not make the measurement true again. Run the command again, or cut
the sentence.

**The reader has the diff.** Files, functions, call sites — `git show` answers all
of it, correctly, forever.

Naming a mechanism is a count too: *"the linter would catch it"*, *"nothing else
reads this"* — a claim about a set you did not enumerate.

**Check the last item in any list of three.** The first two get verified and the
third rides along on the pattern they set.

## Then: read the block your sentence lands in, and cut it

**The unit is the block, not the sentence you just wrote.** Every sentence in a
long comment was justified on the day it was added, and nobody reads the whole
thing — so a comment grows by accretion and never shrinks.

Before the sentence stands, read the **whole** comment block, the whole section:

- **Does your addition make something above it redundant?** A correction
  supersedes what it corrects. Delete the superseded half; do not leave both and
  let the reader work out which is current.
- **Is any of it now held by something that cannot go stale?** A Zod schema says
  what a shape is, a test says what the code does, `CONTRIBUTING.md` says what
  the rules are. Prose repeating one of those is a second copy that drifts.
- **What would a reader lose if the block were three sentences?** Write those
  three. If nothing is lost, that is the block.

**A comment that survives a move has not been re-read.** A section banner
introduces the thing under it; after any split or reorder, check that it still
names what follows.

**What it costs is paid by a reviewer, and it is more than one reading.** Two
comments in one block that disagree cost a *second measurement*, because the only
way to tell which is the false claim is to go and run the thing.

**In a test file, the sentence naming what the test discriminates stays and the
incident that produced it goes.**

## Then: can this be written with fewer sentences?

Ask of each sentence:

- Cover it. Does anything change for the reader? No — cut it.
- Is it narration? `CLAUDE.md` has the test.
- Does a test or a schema already hold this fact? Then it needs no prose.
- Is this the third rewrite of this paragraph? Delete it.

| what | how long |
| --- | --- |
| a commit message | what changed and why. The evidence is in the diff, not here |
| a CHANGELOG entry | what a user can now do. Grouped by feature, never by code change |
| a code comment | what the reader cannot see from the code. If it argues, cut it |
| an issue reply | casual, brief, first person. No release-notes formatting |

## References

**No line number.** It goes wrong on the next edit above it, and the reader has
to search for the symbol anyway. Name the file and the symbol.

## The form

**No em dash in anything a person reads** — product copy, README, release notes,
CHANGELOG, issue replies. Never search and replace: each sentence gets its own
fix, a comma, a colon, a full stop, or a rewrite. An em dash usually marks a
sentence that wants restructuring anyway.

English in the repository, Dutch in the chat.

## Sentences with nothing to measure

- **Description, not assertion** — "this maps the register list into rows"
  describes code the reader can see.
- **Reasoning about a decision** — "one selector per field is easier to read"
  can be disagreed with; it cannot be wrong.

## Stop

Two passes, then stop: the commands, and the shortening. Do not read it a third
time to make it sound better. Do not soften a sentence that survived, and do not
add a hedge to one you now feel less sure about — go and measure it instead.
