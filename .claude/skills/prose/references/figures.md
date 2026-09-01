# Figures

Why the prohibition is flat rather than conditional. History, not state.

**A measured figure that counted the wrong set.** The component census behind
the `meme` decision was written as *"102 wrapped, 81 not, 183 total"*. The
command had run. It counted declarations matching `^const [A-Z]`, and the
sentence named *components* — two different sets, because a component declared
`export const` is invisible to that pattern.

```sh
grep -rn "^const [A-Z]" src/renderer/src --include=*.tsx | wc -l          # what ran
grep -rn "^\(export \)\?const [A-Z]" src/renderer/src --include=*.tsx | wc -l   # what the sentence meant
```

The figure survived three retellings, two artifacts and a decision, because
every retelling was a reflow rather than a re-run. The repair was not a better
count: it was running the same meter over `main` and over the branch, so the
difference could be attributed to the meter rather than to the work.

**A cause asserted from a neighbouring fact.** *"The schemas already exist; this
is wiring, not authoring"* was written about the IPC validation step. Thirty-seven
Zod schemas did exist, and that was the neighbouring fact. None of them described
an IPC argument: twelve of the thirteen argument types were hand-written
interfaces.

```sh
grep -rn "export const .*Schema" src/shared --include=*.ts | wc -l   # the fact that was true
grep -rn "export interface WriteParameters\|export type WriteParameters" src/shared   # the one that mattered
```

The sentence sized a step. It was wrong by the whole authoring half.

**A grep that matched names instead of concerns.** *"Four channels are called
from both a store and a component"* came from intersecting two lists of channel
names. Two of the four were not duplicates at all: in the store, `read` follows
an endianness flip and `stopScanningUnitIds` is a reload cleanup; in the
components both are a button. Same channel, different reason, both correct.

The command answered *"which names appear on both sides"*. The sentence claimed
*"which concerns are duplicated"*. Nothing about running it again would have
caught that.
