#!/usr/bin/env node
/**
 * Fires before a git command that can silently destroy uncommitted work.
 *
 * `git checkout` and `git restore` naming a path restore from the *index*, and
 * on an unstaged file the index is HEAD. `git stash` with nothing to stash is a
 * no-op that still succeeds, so the `git stash pop` after it takes whatever was
 * already on the stack.
 *
 * **It matches the verb, not a spelling.** A prose rule naming one spelling,
 * `git checkout -- `, is a rule the next differently spelled command walks
 * past. It reminds, never blocks, and is silent when nothing is unstaged.
 *
 * Reads the hook payload on stdin, writes hook JSON on stdout.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { readPayload } from './payload.mjs'

/** `git checkout` or `git restore` where a shell would run one, and not `checkout -b`. */
const RESTORING = /(^|&&|\|\||\||;|\(|\n)\s*git\s+(checkout\s+(?!-b\b|--orphan\b)|restore\s+)/

/** Any `git stash`, because the empty-stash trap does not depend on the subcommand. */
const STASH = /(^|&&|\|\||\||;|\(|\n)\s*git\s+stash\b/

/**
 * A checkout naming a path restores files; one naming only a ref switches
 * branch and carries the work along. Asked relative to `cwd`, the directory the
 * command will run in, because a bare name is a path there and not here.
 */
function restoresPaths(text, cwd) {
  const match = text.match(/git\s+(?:checkout|restore)\s+([^;&|\n]*)/)
  if (match?.[1] === undefined) return false
  const args = match[1].trim().split(/\s+/)
  // `--staged` alone writes the index from HEAD and leaves the worktree, so it
  // is the undo of `git add`. With `--worktree` beside it, it destroys again.
  if (args.includes('--staged') && !args.includes('--worktree')) return false
  if (args.includes('--')) return true
  return args.some((a) => a.length > 0 && !a.startsWith('-') && existsSync(join(cwd, a)))
}

/** The verb the user actually typed, so the reminder names their command. */
function verb(text) {
  return /git\s+restore\b/.test(text) ? 'git restore' : 'git checkout'
}

/**
 * The files git would not restore from, which is what this command can take
 * away. An empty list on failure: `execFileSync` throws on a non-zero exit and
 * when it cannot start the process at all, so the catch makes that one answer.
 */
function unstaged(cwd) {
  try {
    return execFileSync('git', ['diff', '--name-only'], { cwd, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.length > 0)
  } catch {
    return []
  }
}

const payload = await readPayload()

const command = payload.tool_input?.command ?? ''
const isStash = STASH.test(command)
const cwd = payload.cwd ?? process.cwd()
const isCheckout = RESTORING.test(command) && restoresPaths(command, cwd)
if (!isCheckout && !isStash) process.exit(0)

const atRisk = unstaged(cwd)
if (atRisk.length === 0) process.exit(0)

const listed = atRisk.slice(0, 10).join(', ')
const rest = atRisk.length > 10 ? ', and more' : ''

const REMINDER = isStash
  ? `These files hold unstaged changes: ${listed}${rest}. \`git stash\` with nothing to stash ` +
    'succeeds anyway, so a later `git stash pop` takes whatever was already on the stack, ' +
    'possibly another branch\'s work. To carry work to another branch, `git checkout <branch>` ' +
    'brings it along when nothing conflicts. To measure another commit, use a worktree.'
  : `These files hold unstaged changes: ${listed}${rest}. \`${verb(command)}\` naming a path ` +
    'restores from the index, and for an unstaged file the index is HEAD, so it deletes ' +
    'everything else written in that file with no warning. `git add` first if you mean to ' +
    'keep it. To measure another commit, use a worktree, never the working tree.'

console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: REMINDER }
  })
)
