#!/usr/bin/env node
/**
 * The trigger for `/prose` that does not depend on anyone remembering it.
 *
 * The moment a sentence needs checking is the moment before it is written, and
 * no user words announce it. So the trigger is the *write*: a markdown file, or
 * an edit that adds a comment.
 *
 * It is a reminder, never a block, and it states the whole rule every time. The
 * short form it used to degrade to after the first firing is the form that gets
 * read past, and the sentence being written is the thing at stake.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { readPayload } from './payload.mjs'

/** A comment opener at the start of a line, in TypeScript and JavaScript. */
const ADDS_COMMENT = /(^|\n)\s*(\/\/|\/\*)/

const RULE =
  'This write is prose, not code. Every sentence is a claim, an order, or a measurement — ' +
  'anything else is narration, so cut it. Then read back what you wrote: for every sentence ' +
  'that quotes a message, states a number, names a file or symbol, asserts a cause, or dates ' +
  'an event, run the command for that shape in `/prose` and paste what it returned. A claim ' +
  'you did not measure does not stay. Then read the whole block you are writing into, not the ' +
  'sentence alone: a correction supersedes what it corrects, and a comment nobody reads end ' +
  'to end only ever grows. No em dash in anything a person reads.'

const payload = await readPayload()

const path = payload.tool_input?.file_path ?? ''
const written = payload.tool_input?.content ?? payload.tool_input?.new_string ?? ''

/**
 * A commit message is prose, and it is written through Bash rather than a Write.
 *
 * Anchored to the start of a command rather than matched anywhere in the string:
 * a heredoc writing a test about `git commit`, or a grep for it, is not a commit.
 * That false positive fired on the run that added this line.
 */
const command = payload.tool_input?.command ?? ''
const IS_COMMIT = /(?:^|[;&|]\s*|&&\s*|\|\|\s*)git\s+(?:commit|merge)\b/

const isProse =
  path.endsWith('.md') || ADDS_COMMENT.test(written) || IS_COMMIT.test(command)
if (!isProse) process.exit(0)

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: RULE }
  })
)
