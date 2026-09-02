/**
 * The rule this pins is one sentence: **a hook exits 0 or it is broken.**
 *
 * The harness reads a non-zero code as something to show the user, and 2 as a
 * refusal: on `PreToolUse` that blocks the tool call. None of these may reach
 * it, on input none of them was written against.
 *
 * Ported from `scripts/hooks/hooks.test.ts` in the ploxc repo, which pins the
 * same rule for every hook its settings wire.
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every wired hook, by the filename `.claude/settings.json` names.
 *
 * This list has to be the wiring's, or a hook added there and not here sits
 * outside every claim below.
 */
const WIRED = [
  'bulk-edit-guard.mjs',
  'git-restore-guard.mjs',
  'precommit-trigger.mjs',
  'prose-trigger.mjs',
  'test-trigger.mjs'
]

describe('every wired hook', () => {
  it('the list here is the list in .claude/settings.json', () => {
    const settings = JSON.parse(readFileSync(join(HOOKS, '..', 'settings.json'), 'utf8'))
    const wired = new Set()
    for (const groups of Object.values(settings.hooks)) {
      for (const group of groups) {
        for (const hook of group.hooks ?? []) {
          // Both documented shapes: `command` plus `args`, and the whole line
          // in `command`. Reading one lets a hook wired in the other stay
          // outside every claim below.
          for (const field of [hook.command, ...(hook.args ?? [])]) {
            const name = field?.match(/hooks\/([\w-]+\.mjs)\b/)?.[1]
            if (name !== undefined) wired.add(name)
          }
        }
      }
    }
    expect([...wired].sort()).toEqual([...WIRED].sort())
  })

  it.each(WIRED)('%s exits 0 on a payload it was not written for', (name) => {
    for (const payload of ['', '{not json', '{}', '[]', 'null', '{"tool_input":42}']) {
      const run = spawnSync('node', [join(HOOKS, name)], { input: payload, encoding: 'utf8' })
      expect(run.status, `${name} on ${JSON.stringify(payload)}: ${run.stderr}`).toBe(0)
    }
  })

  it.each(WIRED)('%s says nothing on a payload it was not written for', (name) => {
    for (const payload of ['{}', 'null', '{"tool_input":42}']) {
      const run = spawnSync('node', [join(HOOKS, name)], { input: payload, encoding: 'utf8' })
      expect(run.stdout.trim(), `${name} on ${payload}`).toBe('')
    }
  })
})
