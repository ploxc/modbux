#!/usr/bin/env node
/**
 * Fires before an in-place scripted edit, and names the reads that catch what
 * it did wrong.
 *
 * A scripted substitution fails in three directions and every one is quiet: it
 * removes more than you named, it eats half a sentence in prose and leaves no
 * symbol behind, or it raises before writing and changes nothing at all. A green
 * suite looks the same after each.
 *
 * It reminds and never blocks, and it fires once per session.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { readPayload } from './payload.mjs'
import { firstThisSession } from './session-marker.mjs'

/** In-place editors, in any position a shell would run one. */
const IN_PLACE = /(^|&&|\|\||\||;|\(|\n)\s*(perl\s+-[a-zA-Z]*i|sed\s+-[a-zA-Z]*i)/

const REMINDER =
  'A scripted edit fails quietly in three directions: it removes what you did not name, it ' +
  'eats half a sentence in prose and leaves no symbol behind, or it raises before writing and ' +
  'changes nothing. After it runs: `git diff --stat -- <the files you named>` (empty means ' +
  'nothing happened), `git diff | grep \'^-\' | grep -E \'const |function |export \'` (what ' +
  'left, by name), and for prose `git diff | grep -E \'^[-+][[:space:]]*(//|\\*)\'`. Not ' +
  '`--word-diff`, which prefixes every line with a space so those filters return nothing.'

/** Every firing after it asks the question instead of repeating the rule. */
const SHORT = 'bulk edit: did more leave than you named? did anything happen at all?'

const payload = await readPayload()

if (!IN_PLACE.test(payload.tool_input?.command ?? '')) process.exit(0)
const first = firstThisSession('bulk-edit-guard', payload.session_id)

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: first ? REMINDER : SHORT }
  })
)
