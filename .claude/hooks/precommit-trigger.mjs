#!/usr/bin/env node
/**
 * The trigger for `/precommit` that does not depend on anyone remembering it.
 *
 * The checklist hangs on `git commit`, and the shape that keeps recurring is
 * earlier than a commit: a whole-project command is run on its own, as "is my
 * work finished". By the time the checklist is opened it reads as a repetition
 * of work already done, and step 1 is skipped again. So the trigger is the
 * *command*. Running one of these is being in the checklist, whether or not it
 * was opened.
 *
 * It is a reminder, never a block, and it fires once per session. These
 * commands are legitimate mid-work too, and a hook that argues with you is a
 * hook you learn to ignore.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { readPayload } from './payload.mjs'
import { firstThisSession } from './session-marker.mjs'

/**
 * The whole-project commands, longest first so the lookahead below cannot cut
 * `test:e2e` down to `test`.
 *
 * **The test each entry passes: a numbered step of the checklist names it.**
 * `test:watch` fails it, because watch mode is how you check one change while
 * writing it. So do `npx vitest run <file>` and `npx playwright test <spec>`,
 * which name what they run. `test:e2e:scan-perf` fails it too: CONTRIBUTING
 * calls it a measurement rather than a check.
 */
const WATCHED = [
  'test:all:windows',
  'test:all:linux',
  'test:all:mac',
  'test:e2e:packaged',
  'test:e2e',
  'typecheck',
  'verify',
  'lint',
  'test'
]

/**
 * Where a shell would actually run one of them: at the start or after a
 * separator, and ending where the script name ends.
 *
 * **Anchored, not a substring**, or it fires on prose quoting the command.
 * A `grep -rn 'yarn lint' CONTRIBUTING.md` would spend the session's one
 * reminder.
 *
 * **The right-hand side is a lookahead, not a space.** A separator can follow
 * with no whitespace, as in `yarn lint; echo` or `(yarn lint)`, and what must
 * still not match is a longer script name.
 */
const RUNS_IT = new RegExp(
  String.raw`(^|&&|\|\||\||;|\(|\n)\s*yarn (${WATCHED.join('|')})(?![A-Za-z0-9:_-])`
)

const REMINDER =
  'This command is a step of the `/precommit` checklist. Running it means you are in the ' +
  'checklist, so if this is you finishing work rather than checking one change, invoke ' +
  '`/precommit` and start at step 1, reading the diff, rather than in the middle. Doing the ' +
  'substance of a step is not doing the step.'

/** Every firing after it asks the question instead of repeating the rule. */
const SHORT = 'precommit: finishing work, or checking one change?'

const payload = await readPayload()

const command = payload.tool_input?.command ?? ''
if (!RUNS_IT.test(command)) process.exit(0)
const first = firstThisSession('precommit-trigger', payload.session_id)

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: first ? REMINDER : SHORT }
  })
)
