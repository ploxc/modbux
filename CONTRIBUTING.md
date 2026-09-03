# Contributing to Modbux

Everything below is a rule rather than a suggestion. Eleven of them are asserted
by `src/__tests__/conformance.test.ts`, so breaking one fails `yarn test` instead
of waiting for a reviewer.

## Ground rules

1. **Open an issue first.** Describe the bug or the feature before writing code, so a change that does not fit the project's direction is found before you build it.
2. **One PR, one concern.** Don't mix a bug fix with a refactor, and don't sneak in "while I was here" changes.
3. **Don't break the build.** Run `yarn verify` before pushing. If it doesn't pass, your PR won't be reviewed.
4. **Match the existing style.** Don't introduce new patterns, conventions, or abstractions without discussing them first.

## Getting started

```bash
git clone https://github.com/ploxc/modbux.git
cd modbux
yarn
yarn dev
```

**Prerequisites:** Node.js (LTS) and Yarn.

## Project structure

```
src/
  main/            Electron main process (server, IPC, state)
  renderer/src/    React UI (components, hooks, containers, theme)
  preload/         Electron preload script
  shared/          Types, utilities, migrations (used by both processes)
e2e/
  specs/01-main/        Core feature tests
  specs/02-standalone/  Persistence & restart tests
  specs/03-presentation/ Screenshot & demo generation
  specs/99-hardware/    Hardware integration tests (Arduino)
  fixtures/             Test data and helpers
```

**Path aliases:** `@renderer/*` and `@shared`. There are no others. Use them instead of deep relative imports.

## Code style

Formatting and linting are enforced by ESLint, Prettier, and TypeScript strict mode. Run `yarn lint` to auto-fix issues. Don't fight the tooling, don't disable rules inline, and don't modify `.eslintrc`, `.prettierrc`, `.editorconfig`, or `tsconfig` files without prior discussion.

Beyond what the linter catches:

- **No `any`, no `@ts-ignore`.** If the types are fighting you, your approach is wrong.
- **No `!` either, and no guard a test cannot reach.** `noUncheckedIndexedAccess` is on, so `record[key]` and `array[i]` are `T | undefined` and every index asks a question. A non-null assertion answers it without leaving the reasoning behind, and `if (!x) break` on an index that is provably in range is a branch no input reaches, no test covers and no mutation can turn red, while telling the reader the case is possible. Take the index away instead: `readUInt16BE`, `for..of`, `.entries()`, `slice`. Where something really can be missing, handle it and test it.
- **Zod for validation.** External data (configs, IPC payloads) is validated with Zod schemas. Don't trust unvalidated input.
- **Zustand + Mutative for state.** Follow the existing store patterns. Don't introduce new state management approaches.
- **MUI only.** Don't add other UI libraries.
- **Spell out variable names.** `resetButton`, not `rstBtn`. `registerAddress`, not `regAddr`. Abbreviations make code harder to read. The only exceptions are well-known conventions like `i` in loops, `el` in DOM callbacks, `z` for Zod schemas and Zustand state accessors, and established project abbreviations like `e2e`.
- **Match existing patterns.** Look at how the codebase does it, do it the same way.

### The conventions this codebase has already settled

`src/__tests__/conformance.test.ts` asserts the eleven rules below, so a PR that
breaks one fails `yarn test` rather than waiting for a reviewer to notice. Every
rule asserts that the population it reads is not empty before it asserts the
population holds no violation, because a meter that reads no files passes every
rule it has.

**One store selector per field.** `useClientZustand((z) => z.a)` and then
`((z) => z.b)`, never one selector returning an object. An object literal is a
new reference on every render, so a selector that returns one re-renders its
component on every flush of any field. The same goes for a call with no selector
and for `(z) => z`, which take the whole store the long way round. The renderer
has zero of all three and zero `useShallow`, and that is why it draws a
two-thousand-row grid without either.

**An action is fetched where it runs, not subscribed to.** A selector that hands
back a store function puts that function in the dependency list, and a
dependency list naming something the component does not own is a list no reader
can check. What the component holds goes in the list; what the store holds is
read through `getState()`. That also covers a *value* the component wants at a
moment rather than on every change: read that way, it causes no render.

Two shapes, and which one you write depends on whether the component adds
anything. A handler that does its own work is a `useCallback` whose first line
reads the store, `const clientZustand = useClientZustand.getState()`. A prop
that only forwards takes the action itself,
`const setHost = useClientZustand.getState().setHost`, because wrapping it in a
`useCallback` that calls it with the same arguments only gives it a second name.

Either way the thing has a name and the prop takes the name, so a `getState()`
written into a JSX attribute breaks the rule from the other side: the call sits
where the reader is looking at layout, and a handler with no name is a handler
with nothing to read.

**Every component is wrapped in `meme`.** Props or not, one rule with no
exception to remember. A declaration counts as a component when it is rendered
as JSX somewhere or exported as its file's default. React's bare `memo` does not
satisfy it: `meme` is `memo` with `deepEqual`, and the shallow comparator is what
a mutated row defeats.

**A local store is named after its component.** `<name>.zustand.ts`, matching
the global stores in `context/`, and named after the component rather than the
folder it sits in.

**MUI is imported deep.** `@mui/material/Button`, not `@mui/material`. The same
for `@mui/icons-material`, `@mui/x-data-grid` and `@mui/x-date-pickers`, because
the rule is about barrels and those are barrels. Two exceptions are the package's
doing rather than a choice: `useGridApiContext` and `useGridApiRef` are exported
by none of the thirteen subpaths `@mui/x-data-grid` declares, so they come from
the root.

**Nothing in `src/shared` imports from `src/main`.** All three processes import
shared; it is the one layer that may not reach back.

**Every interactive element carries a `data-testid`.** Buttons, fields, sliders,
selects and grid action cells. Containers do not, because the e2e suite reaches
what is inside them instead: a `ToggleButtonGroup` through its `ToggleButton`s,
and a `Select`'s options through `getByRole('option')`. The `Select` itself
carries one. A picker takes the attribute through `slotProps`, which still
counts as carrying it.

**Every channel that carries an object declares a schema.** TypeScript covers a
bare primitive and sixteen channels take no argument at all. The rest take an
object or a union, and that is where a hand-edited config file arrives. The
schema goes beside the handler in `main/ipc.ts`, and it is only accepted where
`undefined` is an honest answer: a rejected payload has nothing else to give
back, so a channel returning a value has to say so in its type.

**Every channel has a caller in the renderer.** `window.api` is generated from
`IPC_CHANNELS`, so a channel nobody calls still gets a method, a handler and a
spec entry, and nothing says so. Two sat that way with the app's only config
repair branch inside one of them, which is worse than no repair at all: it reads
like a guard. The caller has to be in `src/renderer`, because a channel only the
e2e suite drives is one the app does not use, and that is a decision to take
rather than to let happen.

**Every configured path alias is imported through.** `@renderer/*` and `@shared`
are the two, in the tsconfigs and in `electron.vite.config.ts` alike. An alias
nobody imports through resolves whatever it points at, including a directory
that is gone, so the last import leaving is what retires it.

**Every configured include points at something.** A glob that matches nothing
costs nothing to keep and says nothing when it stops being true, so the test
expands it rather than reading its shape.

### Two rules no test can see

**The store owns IPC that changes state; a component owns IPC the user asked
for.** Writing through another store is a mutation, and the store owns those. A
button press is the component's.

The same channel can be called from both and be right both times, which is why
this is a reviewer's judgement and not an assertion: `read` is a consequence of
flipping endianness in the store, and a button in the toolbar. Same channel, two
concerns.

**A component that owns something gets a folder.** Its store, its helpers, its
subcomponents and their tests go in with it, and the folder takes its name. A
component that owns nothing stays a file: `SliderComponent.tsx` and
`HomeButton.tsx` are leaves, `columns/` and `shared/inputs/` are collections of
them, and neither wants a folder each. Where the line falls is a judgement, so
no test draws it.

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/). Lowercase, no period at the end.

```
feat: add RTU support for serial connections
fix: prevent grid clear on address base switch
test: add bitmap schema tests and e2e spec
refactor: move readConfiguration to standalone state
docs: update changelog for v2.0.0
chore: bump version to 2.0.0
```

**Rules:**
- `feat` = entirely new functionality
- `fix` = something was broken, now it's not
- `refactor` = same behavior, different code
- `test` = test-only changes
- `docs` = documentation-only changes
- `chore` = tooling, deps, version bumps

Don't use `feat` for a bug fix. Don't use `fix` for a refactor. Mean what you say.

## Testing

### What to run

| Command | What it does |
|---------|-------------|
| `yarn test` | Unit tests (Vitest) |
| `yarn test:watch` | Unit tests in watch mode |
| `yarn test:e2e` | Build + the e2e suite (Playwright) |
| `yarn test:e2e:packaged` | Same specs against the packaged app. Run before releasing. |
| `yarn test:e2e:hardware` | The `99-hardware` specs. Needs an Arduino; skips without one. |
| `yarn presentation` | Build + regenerate the documentation screenshots |
| `yarn verify` | Lint + typecheck + unit + e2e. Run this before pushing. |
| `yarn test:e2e:scan-perf` | What a mounted grid costs during a scan. A measurement, not a check. |
| `yarn test:e2e:privileged-port` | The port 502 modal. Linux, and someone at the keyboard. |
| `yarn test:all:mac` | Everything this platform can run, ending with the hardware specs. |
| `yarn test:all:windows` | Everything this platform can run. No socat, so the socat serial specs skip. |
| `yarn test:all:linux` | Everything, including the one that waits for a person. |

`test:e2e` covers `01-main` and `02-standalone`. Two suites sit outside it and
are invoked on purpose:

- `99-hardware` needs an Arduino on a serial port. It finds the board by USB
  vendor ID and skips the suite when none is attached, so it runs unattended.
  CI has no board, which is why it stays out of `test:e2e`.
- `03-presentation` is a documentation utility, not a check. It clicks through
  the app and captures what it sees without asserting much, so it costs two
  minutes to tell you little that `01-main` does not already cover. Run it when
  the UI changed and the manual needs new screenshots.

`verify` deliberately leaves out `test:e2e:packaged`, which adds a full packaging
step and runs far longer than is worth doing on every push. The `test:all:*`
rounds do include it, and those are for cutting a release rather than for a PR.
It is the only check that exercises what actually ships: `electron-vite`
externalizes whatever sits in `dependencies` and `electron-builder` packs only
those into `app.asar`, so a runtime dependency
that drifts into `devDependencies` passes every normal test and breaks only once
installed. Packaged runs use a throwaway user-data directory and never touch an
installed Modbux's config.

`playwright.config.ts` ignores `99-hardware`, so neither `test:e2e` nor
`test:e2e:packaged` picks those specs up. They need an Arduino running
`tools/arduino/iem3000.ino` on a serial port. The board is found by USB vendor
ID rather than by `manufacturer`, which reads "Microsoft" on Windows where the
generic driver claims the device. Every `test:all:*` ends with this round, and
`yarn test:e2e:hardware` runs it alone.

### Test expectations

- **New features need tests.** Unit tests for logic, e2e tests for UI behavior.
- **Bug fixes need a regression test.** Prove it was broken, prove it's fixed.
- **Tests must be deterministic.** No flaky tests. No "works on my machine". Use `waitForTimeout()` for UI settling and animations, but use `toPass()` when asserting on data that needs time to arrive.
- **e2e tests run serially** with `maxFailures: 1`. One failure stops the entire suite. This is intentional.

### Writing e2e tests

- Use the helpers from `e2e/fixtures/helpers.ts`. Don't reinvent them.
- Assert grid contents with `expectCell()` / `expectCellContains()`, which retry
  until the value arrives. Reach for the raw `cell()` only when the test wants a
  deliberate point-in-time sample, such as comparing two consecutive polls of a
  generator. A cell can still hold the previous read while a new read or a
  freshly loaded mapping is on its way, and a snapshot gets no second chance.
- Use `data-testid` attributes for selectors. Never select by CSS class or DOM structure.
- Spec files are numbered and ordered. New specs go at the end of their directory.
- Presentation scenes (`03-presentation/`) generate the documentation screenshots and are excluded from the default run. If you change UI, update the relevant scenes and run `yarn presentation`.

## Pull requests

1. Branch from `main`. Use `feature/description` or `fix/description`.
2. Keep commits clean. Squash fixups before requesting review.
3. Write a clear PR description: what changed, why, and how to test it.
4. `yarn verify` must pass. No exceptions.
5. Screenshots for UI changes. Before and after.
6. Don't bump the version number. That's done at release time.

## What will get your PR rejected

- Failing `yarn verify`
- `any` types or disabled lint rules
- Missing tests for new functionality
- Unrelated changes mixed into the diff
- New dependencies without prior discussion
- Changes to `.editorconfig`, `.prettierrc`, or `.eslintrc` without prior discussion
- Commit messages that don't follow the convention

## Reporting bugs

Use the [bug report template](https://github.com/ploxc/modbux/issues/new?template=bug_report.md). Include:

- Modbux version
- OS and version
- Steps to reproduce (exact, not approximate)
- Expected vs. actual behavior
- Screenshots if it's a UI issue

## Feature requests

Use the [feature request template](https://github.com/ploxc/modbux/issues/new?template=feature_request.md). Explain the problem you're solving, not just the solution you want.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
