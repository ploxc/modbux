# Five rules, five mutations

**Eight tests were written and none of them had been seen to fail.**
`toRegisterParams` was extracted out of a 89-line function, and its tests were
written against the extracted code and passed on the first run. That is the
shape the rule exists for: a test written after the thing it tests, green from
the start, proves only that it agrees with the code it was copied from.

Run afterwards, one rule at a time:

```
                                                baseline: 27 passed
interval: drop the seconds-to-ms conversion     1 failed | 26 passed
unix: stop converting to seconds                1 failed | 26 passed
utf8: fall back to 1 instead of 10              1 failed | 26 passed
generated timestamp: honour min and max         1 failed | 26 passed
drop the comment                                1 failed | 26 passed
                                                restored: 27 passed
```

**Exactly one test red per mutation** is what makes the set discriminating
rather than overlapping. A mutation that reddens four tests has found a shared
helper, not a covered rule.

**A sixth run reported `Tests no tests`**, which looks like a mutation nothing
covers and was a quoting error in the script doing the mutating: the file no
longer parsed, so vitest collected nothing. A mutation run that reports *no
tests* rather than a failure has broken the file, and says nothing about
coverage.

The restore is checked rather than assumed:

```sh
git status --porcelain <file>    # empty, or the file is still mutated
```
