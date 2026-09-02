# A meter is a claim too

A script that counts is a claim about a population, and it is wrong in the same
ways prose is. Four times in one branch, on 1 and 2 September 2026:

**It counted a different set than the sentence named.** The conformance run's
audit said 83 components were unwrapped. Re-measuring with the rule the audit
itself stated found 86: `ExpandCell` in `columns/bitmapExpand.tsx` and `Action`
in both `columns/interpolation.tsx` and `columns/write.tsx` are rendered from a
`getActions` array, which is JSX the first pass did not follow.

**It looked in one place when the thing had two.** A meter for interactive
elements without a `data-testid` reported the `DateTimePicker` as missing one.
It has carried `add-reg-datetime-input` all along, nested inside `slotProps`
where a reader of JSX attributes does not go.

**It was wrong in both directions on the same input.** Deciding whether a
tsconfig `include` points at anything by reading the directory part off the glob
got `electron.vite.config.*` wrong, then got it wrong the other way after the
fix. Expanding the glob with `globSync` answers the question that was asked; a
rule about the shape of the string answers a different one.

**It matched the name and not the thing.** Renaming `rootState` to `clientState`
with a regex renamed the `clientState` *field* on the store as well, producing
`clientState.clientState`. The language service knows which binding an
identifier is on; a search and replace knows only the characters.

## The rule

State what population the meter counted, then ask whether that is the noun in
your sentence. Run it over a tree where you already know the answer. If a meter
and a reading disagree, the meter is the one to check first, because it is the
one nobody reads.
