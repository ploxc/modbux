# Contributing to Modbux

Thanks for your interest in contributing. Modbux was born from real-world frustration with Modbus tooling, and your help makes it better for the entire industry.

Before you start, please read this document carefully. These guidelines exist to keep the codebase consistent and the review process smooth. They are not suggestions.

## Ground rules

1. **Open an issue first.** Before writing code, open an issue describing the bug or feature. This avoids wasted effort if the change doesn't align with the project direction.
2. **One PR, one concern.** Don't mix a bug fix with a refactor. Don't sneak in "while I was here" changes. Keep your diff focused.
3. **Don't break the build.** Run `yarn checkup` before pushing. If it doesn't pass, your PR won't be reviewed.
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

**Path aliases:** `@main`, `@renderer/*`, `@preload`, `@shared`, `@backend`. Use them instead of deep relative imports.

## Code style

Formatting and linting are enforced by ESLint, Prettier, and TypeScript strict mode. Run `yarn lint` to auto-fix issues. Don't fight the tooling, don't disable rules inline, and don't modify `.eslintrc`, `.prettierrc`, `.editorconfig`, or `tsconfig` files without prior discussion.

Beyond what the linter catches:

- **No `any`, no `@ts-ignore`.** If the types are fighting you, your approach is wrong.
- **Zod for validation.** External data (configs, IPC payloads) is validated with Zod schemas. Don't trust unvalidated input.
- **Zustand + Mutative for state.** Follow the existing store patterns. Don't introduce new state management approaches.
- **MUI only.** Don't add other UI libraries.
- **Every interactive element needs a `data-testid`** for e2e tests.
- **Spell out variable names.** `resetButton`, not `rstBtn`. `registerAddress`, not `regAddr`. Abbreviations make code harder to read. The only exceptions are well-known conventions like `i` in loops, `el` in DOM callbacks, `z` for Zod schemas and Zustand state accessors, and established project abbreviations like `e2e`.
- **Match existing patterns.** Look at how the codebase does it, do it the same way.

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
| `yarn test:e2e` | Build + full e2e suite (Playwright) |
| `yarn test:e2e:packaged` | Same specs against the packaged app. Run before releasing. |
| `yarn test:e2e:hardware` | The `99-hardware` specs. Needs an Arduino and someone at the keyboard. |
| `yarn presentation` | Screenshot & demo generation |
| `yarn checkup` | **Everything.** Lint + typecheck + unit + e2e. Run this before pushing. |

`checkup` deliberately leaves out `test:e2e:packaged` — it adds a full packaging
step and runs far longer, which is too much for every push. Run it before
cutting a release instead: it is the only check that exercises what actually
ships. `electron-vite` externalizes whatever sits in `dependencies` and
`electron-builder` packs only those into `app.asar`, so a runtime dependency
that drifts into `devDependencies` passes every normal test and breaks only once
installed. Packaged runs use a throwaway user-data directory and never touch an
installed Modbux's config.

`playwright.config.ts` ignores `99-hardware`, so neither `test:e2e` nor
`test:e2e:packaged` picks those specs up. They are conditional: they need an
Arduino running `tools/arduino/iem3000.ino` on a serial port, and they stop at a
`page.pause()` for someone to choose the COM port. In a pipeline — or in any run
you walked away from — that is not a failure, it is a run that never ends. Use
`yarn test:e2e:hardware` when the hardware is actually on your desk.

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
- Presentation tests (`03-presentation/`) generate screenshots for the documentation site. If you change UI, update the relevant scenes.

## Pull requests

1. Branch from `main`. Use `feature/description` or `fix/description`.
2. Keep commits clean. Squash fixups before requesting review.
3. Write a clear PR description: what changed, why, and how to test it.
4. `yarn checkup` must pass. No exceptions.
5. Screenshots for UI changes. Before and after.
6. Don't bump the version number. That's done at release time.

## What will get your PR rejected

- Failing `yarn checkup`
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
