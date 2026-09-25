#!/usr/bin/env node
/**
 * The trigger for `/precommit` that does not depend on anyone remembering it.
 *
 * It fires on two kinds of command. A `git commit` or `git merge`, because the
 * skill fires on what the user types, and a commit run through the Bash tool
 * is read by nobody: without this hook every commit an agent makes skips the
 * checklist. And a whole-project check run on its own, as "is my work
 * finished", because by the time the checklist is opened after one it reads
 * as a repetition of work already done, and step 1 is skipped again.
 *
 * It is a reminder, never a block, and it fires on every match: the full text
 * the first time in a session, a short question each time after. A reminder
 * that went quiet after the first commit would miss the second and every one
 * after it.
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

/**
 * A commit or a merge where a shell would run one: at the start or after a
 * separator, and ending where the subcommand ends, so `git commit-tree` and a
 * grep quoting "git commit" stay quiet. A separator with a backslash before it
 * is a grep alternation's `\|`, not a pipe.
 */
const COMMITS = /(?:^|(?<!\\)[;&|]\s*)git\s+(?:commit|merge)(?![\w-])/

const COMMIT_REMINDER =
  'This command commits or merges. The `/precommit` checklist is what a commit is made ' +
  'through: invoke `/precommit` and run it from step 1, reading the diff, before this ' +
  'command runs. A commit you run through the Bash tool triggers no skill by itself.'

/** Every commit after the first in a session gets the question. */
const COMMIT_SHORT = 'did /precommit run for this commit?'

const REMINDER =
  'This command is a step of the `/precommit` checklist. Running it means you are in the ' +
  'checklist, so if this is you finishing work rather than checking one change, invoke ' +
  '`/precommit` and start at step 1, reading the diff, rather than in the middle. Doing the ' +
  'substance of a step is not doing the step.'

/** Every firing after it asks the question instead of repeating the rule. */
const SHORT = 'precommit: finishing work, or checking one change?'

const payload = await readPayload()

const command = payload.tool_input?.command ?? ''
const commits = COMMITS.test(command)
if (!commits && !RUNS_IT.test(command)) process.exit(0)

// Two markers, because a check and a commit are two questions: a lint early in
// the session would otherwise spend the commit's full text.
const first = firstThisSession(
  commits ? 'precommit-trigger-commit' : 'precommit-trigger',
  payload.session_id
)
const additionalContext = commits
  ? first
    ? COMMIT_REMINDER
    : COMMIT_SHORT
  : first
    ? REMINDER
    : SHORT

console.log(
  JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext } })
)
