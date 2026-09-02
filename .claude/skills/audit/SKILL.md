---
name: audit
description: Audit one area of Modbux against the eight criteria and write the findings to tmp/AUDIT-<area>.md, changing no code. Use when the user asks to audit or assess an area, or to re-check one after changes. Do NOT use to review a branch or your own diff — that is /code-review; and do NOT use to execute a finished audit, which is a separate session with fresh context.
---

# Audit one area

**Read-only with respect to code.** The only file this writes is
`tmp/AUDIT-<area>.md`, which is gitignored. Every improvement you spot becomes a
finding, including the one-line obvious ones.

## The areas

Split by what the code shares, not by directory size. One area per run.

| area | what it is |
| --- | --- |
| `modbus` | `main/modules/modbusClient.ts`, `modbusServer.ts` and `modbusServer/` |
| `boundary` | `main/ipc.ts`, `preload/`, `shared/types/ipc.ts`, `main/state.ts`, `main/windows.ts` |
| `shared` | `shared/` minus `types/ipc.ts`: schemas, migrations, pure helpers |
| `stores` | `renderer/src/context/` |
| `client-ui` | `renderer/src/components/client/` |
| `server-ui` | `renderer/src/components/server/`, `components/shared/`, `containers/` |

## Before you start

Read `CLAUDE.md`, `CONTRIBUTING.md` and `src/__tests__/conformance.test.ts`.

The suite already asserts nine conventions. **Do not report what it asserts** —
it is green, so those are closed. Audit what a test cannot see.

## The eight criteria

Apply all eight. Do not merge them and do not skip the cosmetic ones.

1. **What the conformance suite cannot see.** The store-versus-component IPC
   rule, the folder-per-component judgement, and anything else CONTRIBUTING
   states as prose under *Two rules no test can see*.
2. **Duplication.** Search for the shape, not the name. Two functions doing one
   job often share no word, so a search for what one is called returns neither.
   Report identical copies too, because they diverge later. A duplication claim
   carries its own burden of proof, under *Verification*.
   → [WHY: a meter is a claim too](./references/a-meter-is-a-claim.md)
3. **Dead code.** Unused exports, unreachable branches, config entries pointing
   at deleted paths, comments naming files that are gone.
4. **Deferred comments.** Every `TODO`, `FIXME`, `for now`, `later`, `until we`,
   with its exact location and text.
5. **Test coverage.** What is *not* covered. Think like someone with a field
   device, not like the author: a unit id of 0 and of 248, an address at 65535
   with a data type needing four registers, a serial port that disappears
   mid-read, a config file from two versions ago.
6. **File size and module shape.** Four files stand clear of the rest, and the
   distribution is the argument rather than any number you pick:

   ```sh
   find src -name '*.ts' -o -name '*.tsx' | grep -v __tests__ | xargs wc -l | sort -rn | head
   ```

   Propose a split only along a real responsibility boundary, never on length
   alone. Count code lines and test lines separately: a file that looks like the
   worst offender is sometimes a thin one with a large test block bolted on, and
   the two call for opposite conclusions.
7. **Architecture fit.** Does this block RTU over TCP, a second client, the
   gateway idea, or anything `CHANGELOG.md` says is coming?
8. **What modbus-serial actually does.** For `modbus`, `boundary` and `shared`:
   every assumption this code makes about the library is checked against
   `node_modules/modbus-serial/`, not against its README. Two of this project's
   sharper findings came from that gap.
   → [WHY: read the library, not its README](./references/read-the-library.md)

## Reproduce, do not reason

**Build first.** A reproduction against a stale bundle looks like a measurement
and is not one:

```sh
npx electron-vite build
```

Then drive it. The e2e fixtures already stand up a server, a client and a socat
serial pair:

```sh
npx playwright test e2e/specs/01-main/<nn>-<name>.spec.ts
```

For a claim about the wire, a scratch spec beats reading. For a claim about a
schema or a pure helper, `npx vitest run <file>` in a scratch test is faster than
either.

**A reproduced defect beats ten lines of reading.** Delete your scratch files
when you are done.

## Recording a finding

Every finding is a heading in this exact form, and then the fields under it:

```
### <ID> · `<file> <symbol>` · criterion <1-8> · <severity> · size <S|M|L> · reproduced
```

The ID is the area's initial and a number: `F1`, `CU-01`, `B-04`. Drop
`reproduced` when you did not run it.

**The heading is the form, not a suggestion.** Six agents were given the field
list and five wrote the same heading; the sixth used numbered titles with the
fields as bullets, and a grep for severity across the six documents found
nothing in that one. The document was fine and the count was wrong.

Under the heading: `claim` (one sentence) · `evidence` (the code, or the command
and its output) · `proposal` · `recipe` if reproduced.

**severity — what the app does to a user decides it, not how much it annoys
you.**

| | |
| --- | --- |
| **blocking** | A user gets a wrong answer, a crash, or lost configuration. A malformed frame reaching the socket. A register read as the wrong type. Also: dead code that makes something look covered when it is not. |
| **annoying** | Right behaviour, wrong construction. Duplication, a rule enforced in one of two places, untested logic. Nothing a user sees today; the next change here is where it bites. |
| **cosmetic** | Neither. A stale comment, an unused export, a name that misleads. |

**size — how much work the proposal is, not how large the defect is.** **S** is
one file and no decision. **M** touches several call sites or needs a small
decision you can make from the area alone. **L** needs a decision that is not
yours: a protocol question, a persisted shape, or anything crossing two areas.

**Give the exact recipe if you reproduced it** — the file contents and the
command, complete enough to paste. A recipe that does not work as written is
worse than none, because the next person dismisses a real defect.

**Anchor on the symbol, not the line.** `modbusClient.ts readRegisters`, not
`modbusClient.ts:412`. A line number is right for one commit; the symbol keeps
working. The exception is inside a finding's evidence, where the line is what
makes it checkable.

**Do not record a file's size as a number.** A size is worth writing only as an
argument: past the threshold, and here is why it is still one file.

## Also record what you checked and found sound

A document listing only defects leaves the reader unable to tell "examined and
correct" from "not looked at". Say what you read and what held, briefly.

A claim you could not settle is an **open question**, labelled as one. Not a
finding.

## Verification

Every finding goes to a second agent whose job is to **break** it. That is not a
reviewer looking for problems; it is handed a claim and asked to demonstrate it
wrong.

- **refuted** — you can demonstrate it is wrong. Give the demonstration.
- **unconfirmed** — neither proved nor disproved. **Keep it.** Say what you
  checked and what would settle it.
- **confirmed** — independently verified.

**The bar for rejection is high.** A wrong finding costs one look; a dropped
correct one costs a defect in a released build. When in doubt: unconfirmed.
**No verdict returned counts as kept, never as rejected.**

Two exceptions, where the burden runs the other way:

- **A duplication claim must be actively substantiated.** If you cannot show the
  two are equivalent in behaviour, refute it and say how they differ.
- **A claim marked reproduced must actually reproduce.** Finding one that does
  not is the most valuable single outcome available to you.

## What a finding is worth once it is written

| part | trust |
| --- | --- |
| the file, the symbol, the evidence | high, and verifiable |
| the claim, if reproduced | high |
| the claim, if only read | good |
| **the recipe** | **low** — the most common defect in an audit is a recipe describing an input that does not trigger the behaviour |
| **the proposal** | **low** — a guess by someone who did not read the rest of the file |
| any summary or state | **low** — a compression, and compressions interpret |

Open the file, reproduce, then decide. Being written down is not evidence.

## When more than one area is done

**Group the blocking findings by cause before anyone fixes them.** Six areas
audited in parallel produced 28 blocking findings that turned out to be thirteen
causes, and three of those thirteen were invisible from any single document.
→ [WHY: the same bug from three directions](./references/one-bug-three-reports.md)

Write `tmp/AUDIT-clusters.md`: one section per cause, naming the findings it
holds, what they share, and what a fix has to settle. Keep the per-finding
evidence where it is; the cluster document points, it does not copy.

Check every blocking finding reaches the document:

```sh
for a in <areas>; do
  grep -E '^#{3,4} .*· blocking' tmp/AUDIT-$a.md | sed 's/^#*  *//;s/ ·.*//' | while read id; do
    grep -q "$a/$id" tmp/AUDIT-clusters.md || echo "missing: $a/$id"
  done
done
```

**A wrong grouping is a new way to be wrong.** A cluster that is really two
causes gets fixed as one and half of it survives, so the refutation reviewer is
asked to break the grouping as well as the claims.

**A cluster's size is not the largest size inside it.** Each finding was sized
inside one area by someone who could not see the others. Four of the thirteen
here needed a decision that fits in no single area, which is size L whatever the
findings said.

## Finish by reporting

The document path, then one line per finding: severity, symbol, claim. Then
stop. Proposing is the whole job, and the session that proved a defect is the
worst one to fix it: it is invested in the finding and has read past everything
it already dismissed.
