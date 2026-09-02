#!/usr/bin/env node
/**
 * The trigger for `/prose`, on every write rather than the prose-looking ones.
 *
 * A heredoc puts the sentence in `command`, so a matcher reading `content` and
 * `new_string` never sees it. Both halves classify as little as possible, it
 * reminds and never blocks, and it says the whole rule every time: a short form
 * gets read past.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { IS_COMMIT, WRITES_A_FILE } from './bash-target.mjs'
import { readPayload } from './payload.mjs'

const RULE =
  'This write is prose, not code. Every sentence is a claim, an order, or a measurement — ' +
  'anything else is narration, so cut it. Then read back what you wrote: for every sentence ' +
  'that quotes a message, states a number, names a file or symbol, asserts a cause, or dates ' +
  'an event, run the command for that shape in `/prose` and paste what it returned. A claim ' +
  'you did not measure does not stay. Then read the whole block you are writing into, not the ' +
  'sentence alone: a correction supersedes what it corrects, and a comment nobody reads end ' +
  'to end only ever grows. No em dash in anything a person reads.'

const payload = await readPayload()
const input = payload.tool_input ?? {}
const command = input.command ?? ''

const namesAFile = typeof input.file_path === 'string' && input.file_path.length > 0

if (!namesAFile && !IS_COMMIT.test(command) && !WRITES_A_FILE.test(command)) process.exit(0)

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: RULE }
  })
)
