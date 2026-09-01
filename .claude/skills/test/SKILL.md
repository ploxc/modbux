---
name: test
description: Decide which tests a change needs and prove each one can fail. Use before changing code, while writing or editing a test, and after a review or a user hands you a defect. Do NOT use to run the suites before a commit — that is precommit.
---

# Test

## Before you change anything

Test the **blast radius**, not the bug. The bug's own test goes green and the
regression lands in a neighbouring path of the same function.

Two steps, no transitive closure:

1. **The callers** of what you are changing. `grep -rn '<name>' src/` — then ask
   per caller whether the rule is true of *it*.
2. **The input forms** that reach it. A register type, a data type, an endianness,
   a unit id, an address at the top of its range. Enumerate the axes; do not
   assume the value you have in mind is the shape.

Then: what of that radius is covered — not whether tests exist, whether they
touch *this* — what the behaviour should be across all of it, write those, run
them. Anything already failing that your change does not turn green goes to the
user with the output. Never absorbed, never left because it was there first.

## Which suite can see it

| | sees | cannot see |
| --- | --- | --- |
| **vitest** | pure functions, schemas, migrations, stores, a component in isolation | Electron, IPC, the real DataGrid, anything across two windows |
| **Playwright** | the app as a user drives it, both windows, a real Modbus socket | anything without a `data-testid` to address it |

`yarn test` strips types rather than checking them, so a wrong annotation passes
it and only `yarn typecheck` says so.

**A behaviour that only the e2e suite can see is a behaviour with one test.**
Say so when you write it, because the fast loop will not protect it.

## Every fix ships a pair

| the test | what it guards | when it is red |
| --- | --- | --- |
| the **state that must not recur** | the exact input the finding named | before the fix |
| the **state that must keep working** | the behaviour beside it, which the fix could break | never |

Apply the fix and run both; revert it and run both again. The first must go red
and the second must stay green. If both stay green, the pair does not test the
fix.

**A repair changes behaviour in two directions and you will test one.** The
finding names what was wrong; nothing in it names what was right. Name the input
the old behaviour handled correctly, and put it in the list.

## Then prove it can fail

A test written after the fix proves nothing until you have watched it go red.
→ [WHY: five rules, five mutations](./references/five-rules-five-mutations.md)

**Mutate the rule, not the function.** One rule per run, restored between:

```sh
cp <file> /tmp/orig                       # then edit one rule
npx vitest run <the test file>            # want: exactly the test for that rule, red
cp /tmp/orig <file>                       # and green again
git status --porcelain <file>             # empty, or the restore did not take
```

- **Break the rule you are claiming, not something it shares.** A change to a
  helper two rules call goes red for whichever is load-bearing, which reads
  exactly like proof for the other.
- **A condition is as many mutations as it has clauses.** Per clause: delete it,
  which asks whether it is load-bearing, and put the neighbouring rule in its
  place, which asks whether it is the *right* one. The second finds the
  survivors — a rival that refuses the same input you happened to write is
  invisible to a deletion.
- **Edit by line number or by a unique string, not by the first match.** `sed`,
  `replace(old, new, 1)` and a first-hit search all take the first one, and a
  codebase repeats lines. If a mutation reports *no tests* rather than a failure,
  it broke the file: that is your quoting, not the code.
- **Assert what the code did, not what it said.** The value in the store, the
  cell in the grid, the bytes on the wire. Not that a handler was called.
- **Assert what must appear, not what must be absent.** A thing never produced
  and a thing correctly produced empty read identically, and most mutations stop
  something happening.
- **When the output is a message, assert which one, never how many.** A count
  passes with the guard removed, because the input still earns exactly one
  message and it is the wrong one.
- **Name the wrong behaviour it rules out.** If you cannot name an input that
  answers differently under the rival rule, the test does not discriminate.

## Write it as the difficult user

Not the well-behaved one. An address at 65535 with a data type that needs four
registers. A unit id of 0, and of 248. An empty comment, and one with a newline
in it. A config file from two versions ago. A serial port that disappears
mid-read. Everything that "nobody would do" — someone with a field device does.

## The e2e suite is one app, in order

`playwright.config.ts` sets `workers: 1` and `retries: 0`, and every spec is a
`test.describe.serial`. The specs share one running app and one server, so:

- **A spec cleans up before it starts**, not after it ends. `cleanServerState`
  is the first test in the ones that configure a server, because the spec before
  it may have failed halfway.
- **The number in the filename is the order.** A spec that needs what an earlier
  one built is a spec that breaks when run alone.
- **The DataGrid virtualises both axes**, so a column far enough right or a row
  far enough down is not in the DOM. `MODBUX_E2E=1` is set by the fixture for
  exactly that, and it is never set in a shipped build.
- **A failure that does not reproduce is reported, not re-run into silence.**
