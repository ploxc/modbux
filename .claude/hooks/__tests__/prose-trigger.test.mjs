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

describe('prose-trigger fires on every write and edit', () => {
  it('a markdown write', () => expect(fire({ file_path: 'a.md', content: 'x' })).not.toBe(''))
  it('an edit adding a line comment', () =>
    expect(fire({ file_path: 'a.ts', new_string: '  // why\nconst x = 1' })).not.toBe(''))
  it('an edit adding a block comment', () =>
    expect(fire({ file_path: 'a.tsx', new_string: '/* why */\nconst y = 2' })).not.toBe(''))

  // The classification these three used to fail is what let a refactor's worth
  // of comments through: an edit that reads as code today carries a comment in
  // the next call, and the hook has no way to know which is which.
  it('code with no comment in it', () =>
    expect(fire({ file_path: 'a.ts', new_string: 'const x = 1' })).not.toBe(''))
  it('a file that is neither markdown nor source', () =>
    expect(fire({ file_path: 'a.json', content: '{"a":1}' })).not.toBe(''))
  it('a write that names a file and no content at all', () =>
    expect(fire({ file_path: 'a.ts' })).not.toBe(''))
})

describe('prose-trigger stays quiet on', () => {
  it('a payload with no tool_input', () => expect(fire(null)).toBe(''))
  it('a tool that names no file and runs no command', () =>
    expect(fire({ pattern: 'foo', path: 'src' })).toBe(''))
  it('an empty file path', () => expect(fire({ file_path: '' })).toBe(''))
})

describe('prose-trigger reaches an edit made through Bash', () => {
  // Every one of these wrote a TypeScript comment during the C1 refactor and
  // the hook said nothing, because the text sat in the command rather than in
  // content or new_string.
  it('fires on a heredoc', () =>
    expect(fire({ command: "python3 - <<'PYEOF'\nprint(1)\nPYEOF" })).not.toBe(''))
  it('fires on an unquoted heredoc', () =>
    expect(fire({ command: 'cat > a.ts <<EOF\nx\nEOF' })).not.toBe(''))
  it('fires on an in-place sed', () =>
    expect(fire({ command: "sed -i '' 's/a/b/' src/a.ts" })).not.toBe(''))
  it('fires on tee', () => expect(fire({ command: 'echo x | tee src/a.ts' })).not.toBe(''))
  it('fires on a redirect into a file', () =>
    expect(fire({ command: 'echo x > src/a.ts' })).not.toBe(''))

  it('stays quiet on a command that only reads', () => {
    expect(fire({ command: 'yarn test' })).toBe('')
    expect(fire({ command: "grep -rn 'utf8' src/" })).toBe('')
    expect(fire({ command: 'git status --porcelain' })).toBe('')
  })
  it('stays quiet on output thrown away', () =>
    expect(fire({ command: 'yarn lint > /dev/null 2>&1' })).toBe(''))
  it('stays quiet on a `>` that is not a redirect', () => {
    // The anchor before the `>` is what separates these from a write.
    expect(fire({ command: "awk 'NF>4 { print }' src/a.ts" })).toBe('')
    expect(fire({ command: "grep -n '\\-\\->' src/a.ts" })).toBe('')
  })
  it('stays quiet on a pipe, which writes no file', () =>
    expect(fire({ command: 'yarn test 2>&1 | tail -5' })).toBe(''))
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
  // A command that mentions a commit and writes nothing is what keeps this
  // matcher honest. A heredoc mentioning one used to be here too, and now
  // fires as the write it is.
  it('stays quiet on a command that merely mentions the word', () => {
    expect(fire({ command: "grep -rn 'commit' docs/" })).toBe('')
    expect(fire({ command: "rg 'git commit' .claude/" })).toBe('')
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
