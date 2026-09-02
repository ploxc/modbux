/**
 * Both directions, in one run.
 *
 * A matcher narrowed to kill a false positive is how the false negatives get
 * made, so every case here names what must fire and what must not.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-trigger.mjs')

/** What the hook says, or '' when it declined. Throws when it exits non-zero. */
const fire = (toolInput, sessionId = `test-${Math.random()}`) => {
  const payload = JSON.stringify({
    session_id: sessionId,
    ...(toolInput ? { tool_input: toolInput } : {})
  })
  const out = execFileSync('node', [HOOK], { input: payload, encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : ''
}

describe('test-trigger fires on a test written through Write or Edit', () => {
  it('a unit test by its path', () =>
    expect(fire({ file_path: 'src/shared/__tests__/utils.test.ts', content: 'x' })).not.toBe(''))
  it('an e2e spec by its path', () =>
    expect(fire({ file_path: 'e2e/specs/01-main/01-home.spec.ts', content: 'x' })).not.toBe(''))
  it('a source file that grows a describe', () =>
    expect(fire({ file_path: 'src/a.ts', new_string: "describe('x', () => {})" })).not.toBe(''))
  it('a source file that grows an it', () =>
    expect(fire({ file_path: 'src/a.tsx', new_string: "  it('does', async () => {})" })).not.toBe(
      ''
    ))
})

describe('test-trigger stays quiet on', () => {
  it('source with no test call in it', () =>
    expect(fire({ file_path: 'src/a.ts', new_string: 'const x = 1' })).toBe(''))
  it('a markdown file that talks about tests', () =>
    expect(fire({ file_path: 'CONTRIBUTING.md', content: "describe('x', () => {})" })).toBe(''))
  it('a payload with no tool_input', () => expect(fire(null)).toBe(''))
  it('a command that only runs the suite', () =>
    expect(fire({ command: 'npx vitest run src/shared/__tests__/utils.test.ts' })).toBe(''))
  it('a command that only reads a spec', () =>
    expect(fire({ command: 'cat e2e/specs/01-main/01-home.spec.ts' })).toBe(''))
})

describe('test-trigger reaches a test written through Bash', () => {
  it('fires on a heredoc naming a test path', () =>
    expect(
      fire({ command: "cat > src/shared/__tests__/a.test.ts <<'EOF'\nx\nEOF" })
    ).not.toBe(''))
  it('fires on a heredoc carrying a test call', () =>
    expect(fire({ command: "python3 - <<'PY'\ns = \"it('works', () => {})\"\nPY" })).not.toBe(''))
  it('stays quiet on a heredoc that writes neither', () =>
    expect(fire({ command: "python3 - <<'PY'\nprint(1)\nPY" })).toBe(''))
})

describe('test-trigger states the rule once, then asks', () => {
  it('gives the whole rule first and the questions after', () => {
    const session = `same-${Math.random()}`
    const first = fire({ file_path: 'a.test.ts', content: 'x' }, session)
    const second = fire({ file_path: 'b.test.ts', content: 'y' }, session)
    expect(first).toContain('A test you have not seen fail proves nothing')
    expect(second).toContain('seen it fail')
    expect(second).not.toBe(first)
  })
})

describe('test-trigger never interrupts', () => {
  it('exits 0 on unparseable stdin', () =>
    expect(execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' })).toBe(''))
})
