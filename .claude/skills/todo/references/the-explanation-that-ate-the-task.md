# The explanation that ate the task

Why the routing test runs again when you are only adding a paragraph.

**Ploxc's `TODO.md` went back to being a history one appended paragraph at a
time, and nobody noticed until it was unusable.** The gauge that caught it is
lines per open item. Its own `todo` skill records **10.6** on the morning of the
split and **4.7** after it; both figures are quoted from there, not measured
here.

```sh
awk 'END{printf "%.1f lines per open item\n", NR/o} /^[[:space:]]*- \[ \]/{o++}' TODO.md
```

**Read a rise, not a level.** Anything shorter than the current mean lowers it,
so six one-line tasks move the number as far as a large cut does. What it
measures is *prose per task*, and the only thing that raises it is prose.

The shape is the same at document scale. Ploxc's `precommit` skill records
going 5398, 5523, 5699 and 5799 words over four review rounds, one correct step
added per round, until the round was stopped rather than the steps refused.

Modbux's `TODO.md` is untracked and small enough that the gauge is not worth
running. The rule it produced is the part that transfers: **an addition that
explains belongs where records go, not on the task.**
