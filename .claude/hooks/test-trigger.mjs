#!/usr/bin/env node
/**
 * The trigger for `/test`, at the moment a test is written rather than at the
 * commit that carries it.
 *
 * A test written from the same model as the fix inherits that model's blind
 * spot, and `precommit` opens hours later.
 *
 * The first firing of a session states the rule; every one after it asks the
 * questions. It reminds and never blocks.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { pathsIn, WRITES_A_FILE } from './bash-target.mjs'
import { readPayload } from './payload.mjs'
import { firstThisSession } from './session-marker.mjs'

/** The three spellings this suite uses. Vitest and Playwright share them. */
const IS_TEST_CODE = /\b(describe|it|test)\s*\(/

/** A path that is a test whatever it holds. */
const IS_TEST_PATH = /(^|\/)__tests__\/|(^|\/)e2e\/|\.test\.[tj]sx?$|\.spec\.[tj]sx?$/

const FULL =
  'This write is a test. Which tests the change needs, and whether each one can fail, is ' +
  '`/test`: cover the blast radius rather than the bug, ship the pair (the state that must ' +
  'not recur and the state that must keep working) and prove the first goes red when the fix ' +
  'is reverted. A test you have not seen fail proves nothing.'

const SHORT = 'test: seen it fail? does the pair cover both directions?'

const payload = await readPayload()

const input = payload.tool_input ?? {}
const path = input.file_path ?? ''
const written = input.content ?? input.new_string ?? ''
const command = input.command ?? ''

// A heredoc writing a test names neither `file_path` nor `new_string`, so the
// command is asked the same two questions: a test path among the paths it
// names, or a test call in the bytes it is about to write.
const bashWritesATest =
  WRITES_A_FILE.test(command) &&
  (pathsIn(command).some((p) => IS_TEST_PATH.test(p)) || IS_TEST_CODE.test(command))

// The content rule reads code only. `describe(` inside a markdown table is
// prose about tests, and matching it fires the hook on documentation.
const isSource = /\.[tj]sx?$/.test(path)
const writeIsATest = IS_TEST_PATH.test(path) || (isSource && IS_TEST_CODE.test(written))
if (!writeIsATest && !bashWritesATest) process.exit(0)

const first = firstThisSession('test-trigger', payload.session_id)

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: first ? FULL : SHORT }
  })
)
