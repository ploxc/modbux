/**
 * Both directions, in one run.
 *
 * A matcher narrowed to kill a false positive is how the false negatives get
 * made, so every case here names what must fire and what must not. The payloads
 * are built rather than typed: a hand-escaped one in a shell went through as
 * unparseable, and the hook read that as nothing to say — which looks exactly
 * like a matcher declining.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'prose-trigger.mjs')

/** What the hook says, or '' when it declined. Throws when it exits non-zero. */
const fire = (toolInput, sessionId = `test-${Math.random()}`) => {
  const payload = JSON.stringify({ session_id: sessionId, ...(toolInput ? { tool_input: toolInput } : {}) })
  const out = execFileSync('node', [HOOK], { input: payload, encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : ''
}

describe('prose-trigger fires on', () => {
  it('a markdown write', () => expect(fire({ file_path: 'a.md', content: 'x' })).not.toBe(''))
  it('an edit adding a line comment', () =>
    expect(fire({ file_path: 'a.ts', new_string: '  // why\nconst x = 1' })).not.toBe(''))
  it('an edit adding a block comment', () =>
    expect(fire({ file_path: 'a.tsx', new_string: '/* why */\nconst y = 2' })).not.toBe(''))
})

describe('prose-trigger stays quiet on', () => {
  it('code with no comment', () =>
    expect(fire({ file_path: 'a.ts', new_string: 'const x = 1' })).toBe(''))
  it('a // that is inside a string', () =>
    expect(fire({ file_path: 'a.ts', new_string: "const u = 'http://x'" })).toBe(''))
  it('a file that is neither markdown nor commented code', () =>
    expect(fire({ file_path: 'a.json', content: '{"a":1}' })).toBe(''))
  it('a payload with no tool_input', () => expect(fire(null)).toBe(''))
})

describe('prose-trigger says the whole rule', () => {
  it('every time, in the same session', () => {
    const session = `same-${Math.random()}`
    const first = fire({ file_path: 'a.md', content: 'x' }, session)
    const second = fire({ file_path: 'b.md', content: 'y' }, session)
    expect(second).toBe(first)
    expect(first).toContain('claim, an order, or a measurement')
  })
})

describe('prose-trigger reaches a commit message', () => {
  it('fires on git commit, which is written through Bash and not a Write', () =>
    expect(fire({ command: 'git commit -F -' })).not.toBe(''))
  it('fires on git merge for the same reason', () =>
    expect(fire({ command: 'git merge --no-ff feature' })).not.toBe(''))
  it('stays quiet on other git commands', () => {
    expect(fire({ command: 'git status --porcelain' })).toBe('')
    expect(fire({ command: 'git diff --staged' })).toBe('')
    expect(fire({ command: 'git log --oneline -5' })).toBe('')
  })
  it('fires when a commit follows another command', () =>
    expect(fire({ command: 'yarn test && git commit -F -' })).not.toBe(''))
  it('stays quiet on a command that merely mentions the word', () => {
    expect(fire({ command: "grep -rn 'commit' docs/" })).toBe('')
    expect(fire({ command: "rg 'git commit' .claude/" })).toBe('')
  })
  it('stays quiet on a heredoc that writes about a commit', () => {
    // This is the false positive that fired while the Bash matcher was added.
    const heredoc = "python3 - <<'PY'\ns = \"expect(fire({ command: 'git commit -F -' }))\"\nPY"
    expect(fire({ command: heredoc })).toBe('')
  })
})

describe('prose-trigger never interrupts', () => {
  it('exits 0 on unparseable stdin', () => {
    expect(execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' })).toBe('')
  })
  it('exits 0 on the JSON null that reaches the try and not the catch', () => {
    expect(execFileSync('node', [HOOK], { input: 'null', encoding: 'utf8' })).toBe('')
  })
})
