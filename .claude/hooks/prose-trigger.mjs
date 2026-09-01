#!/usr/bin/env node
/**
 * The trigger for `/prose` that does not depend on anyone remembering it.
 *
 * The moment a sentence needs checking is the moment before it is written, and
 * no user words announce it. So the trigger is the *write*: a markdown file, or
 * an edit that adds a comment.
 *
 * It is a reminder, never a block, and it fires once per session. A hook that
 * argues on every edit becomes wallpaper.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { readPayload } from './payload.mjs'
import { firstThisSession } from './session-marker.mjs'

/** A comment opener at the start of a line, in TypeScript and JavaScript. */
const ADDS_COMMENT = /(^|\n)\s*(\/\/|\/\*)/

/** The first firing of a session explains the rule. */
const FULL =
  'This write is prose, not code. Every sentence is a claim, an order, or a measurement — ' +
  'anything else is narration, so cut it. Then read back what you wrote: for every sentence ' +
  'that quotes a message, states a number, names a file or symbol, asserts a cause, or dates ' +
  'an event, run the command for that shape in `/prose` and paste what it returned. A claim ' +
  'you did not measure does not stay. Then read the whole block you are writing into, not the ' +
  'sentence alone: a correction supersedes what it corrects, and a comment nobody reads end ' +
  'to end only ever grows. No em dash in anything a person reads.'

/** Every firing after it asks the two questions instead of repeating the rule. */
const SHORT = 'prose: measured? whole block read and cut?'

const payload = await readPayload()

const path = payload.tool_input?.file_path ?? ''
const written = payload.tool_input?.content ?? payload.tool_input?.new_string ?? ''
if (!path.endsWith('.md') && !ADDS_COMMENT.test(written)) process.exit(0)

const first = firstThisSession('prose-trigger', payload.session_id)

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: first ? FULL : SHORT }
  })
)
