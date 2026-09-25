/**
 * A compaction summarises the conversation, and the full rule a reminder hook
 * stated once is not in the summary. `compact-reset` forgets which rules this
 * session has seen, so each is stated in full once more.
 */
import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Each test spawns a hook as a node process. Alone they take milliseconds; in a
// full `yarn test` beside a hundred other files, five seconds ran out.
vi.setConfig({ testTimeout: 30_000 })

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..')

/** What the test hook says on a unit test written in `sessionId`. */
const remind = (sessionId) => {
  const payload = JSON.stringify({
    session_id: sessionId,
    tool_input: { file_path: 'src/a.test.ts', content: "it('x', () => {})" }
  })
  const out = execFileSync('node', [join(HOOKS, 'test-trigger.mjs')], {
    input: payload,
    encoding: 'utf8'
  })
  return JSON.parse(out).hookSpecificOutput.additionalContext
}

const compact = (sessionId) =>
  execFileSync('node', [join(HOOKS, 'compact-reset.mjs')], {
    input: JSON.stringify({ session_id: sessionId, source: 'compact' }),
    encoding: 'utf8'
  })

describe('compact-reset', () => {
  it('has the full rule stated again after a compaction', () => {
    const session = `test-${Math.random()}`
    const full = remind(session)
    const short = remind(session)
    expect(short.length).toBeLessThan(full.length)

    compact(session)

    expect(remind(session)).toBe(full)
  })

  it('leaves another session’s marker alone', () => {
    const session = `test-${Math.random()}`
    remind(session)
    const short = remind(session)

    compact(`test-${Math.random()}`)

    expect(remind(session)).toBe(short)
  })
})
