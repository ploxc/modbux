/**
 * The three Bash guards, both directions.
 *
 * A matcher narrowed to kill a false positive is how the false negatives get
 * made, so every case names what must fire and what must not.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HOOKS = dirname(fileURLToPath(import.meta.url))
const hook = (name) => join(HOOKS, '..', `${name}.mjs`)

const fire = (name, toolInput, extra = {}) => {
  const payload = JSON.stringify({
    session_id: `test-${Math.random()}`,
    ...extra,
    ...(toolInput ? { tool_input: toolInput } : {})
  })
  const out = execFileSync('node', [hook(name)], { input: payload, encoding: 'utf8' })
  return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : ''
}

describe('precommit-trigger', () => {
  it('fires on the whole-project commands the checklist names', () => {
    for (const command of [
      'yarn lint',
      'yarn typecheck',
      'yarn test',
      'yarn verify',
      'yarn test:e2e',
      'yarn test:all:mac'
    ]) {
      expect(fire('precommit-trigger', { command }), command).not.toBe('')
    }
  })

  it('fires when one follows another command', () =>
    expect(fire('precommit-trigger', { command: 'yarn lint && yarn typecheck' })).not.toBe(''))
  it('fires with no whitespace before the separator', () =>
    expect(fire('precommit-trigger', { command: 'yarn lint; echo done' })).not.toBe(''))

  it('stays quiet on watch mode, which is how you check one change', () =>
    expect(fire('precommit-trigger', { command: 'yarn test:watch' })).toBe(''))
  it('stays quiet on a measurement rather than a check', () =>
    expect(fire('precommit-trigger', { command: 'yarn test:e2e:scan-perf' })).toBe(''))
  it('stays quiet on a single spec or file', () => {
    expect(fire('precommit-trigger', { command: 'npx vitest run src/shared/a.test.ts' })).toBe('')
    expect(fire('precommit-trigger', { command: 'npx playwright test e2e/a.spec.ts' })).toBe('')
  })
  it('stays quiet on prose quoting the command', () =>
    expect(fire('precommit-trigger', { command: "grep -rn 'yarn lint' CONTRIBUTING.md" })).toBe(''))

  it('states the rule once, then asks the question', () => {
    const session = `same-${Math.random()}`
    const again = (command) => {
      const payload = JSON.stringify({ session_id: session, tool_input: { command } })
      const out = execFileSync('node', [hook('precommit-trigger')], {
        input: payload,
        encoding: 'utf8'
      })
      return out.trim() ? JSON.parse(out).hookSpecificOutput.additionalContext : ''
    }
    expect(again('yarn lint')).toContain('start at step 1')
    expect(again('yarn test')).toBe('precommit: finishing work, or checking one change?')
  })
})

describe('bulk-edit-guard', () => {
  it('fires on an in-place sed', () =>
    expect(fire('bulk-edit-guard', { command: "sed -i '' 's/a/b/' src/a.ts" })).not.toBe(''))
  it('fires on an in-place perl', () =>
    expect(fire('bulk-edit-guard', { command: "perl -i -pe 's/a/b/' src/a.ts" })).not.toBe(''))
  it('fires after a separator', () =>
    expect(fire('bulk-edit-guard', { command: "yarn lint && sed -i.bak 's/a/b/' a.ts" })).not.toBe(
      ''
    ))
  it('stays quiet on a sed that only reads', () =>
    expect(fire('bulk-edit-guard', { command: "sed -n '1,20p' src/a.ts" })).toBe(''))
  it('stays quiet on a heredoc, which the prose trigger owns', () =>
    expect(fire('bulk-edit-guard', { command: "python3 - <<'PY'\nprint(1)\nPY" })).toBe(''))
})

describe('git-restore-guard', () => {
  /** A repo with one unstaged change, so the guard has something to warn about. */
  const dirtyRepo = () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-'))
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
    git('init', '-q')
    git('config', 'user.email', 'a@b.c')
    git('config', 'user.name', 'test')
    writeFileSync(join(dir, 'a.ts'), 'const x = 1\n')
    git('add', 'a.ts')
    git('commit', '-qm', 'first')
    writeFileSync(join(dir, 'a.ts'), 'const x = 2\n')
    return dir
  }

  it('fires on a checkout naming a path that exists', () => {
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git checkout -- a.ts' }, { cwd })).toContain('a.ts')
  })
  it('fires on git restore', () => {
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git restore a.ts' }, { cwd })).toContain(
      'git restore'
    )
  })
  it('fires on any git stash', () => {
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git stash' }, { cwd })).toContain('stash pop')
  })
  it('stays quiet on a branch switch, which carries the work along', () => {
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git checkout main' }, { cwd })).toBe('')
  })
  it('stays quiet on checkout -b', () => {
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git checkout -b feature/x' }, { cwd })).toBe('')
  })
  it('stays quiet on checkout -b whose branch name is also a file', () => {
    // Only the -b exclusion separates this from a restore: the path check sees
    // a name that exists and would say yes.
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git checkout -b a.ts' }, { cwd })).toBe('')
  })
  it('stays quiet on --staged alone, the undo of git add', () => {
    const cwd = dirtyRepo()
    expect(fire('git-restore-guard', { command: 'git restore --staged a.ts' }, { cwd })).toBe('')
  })
  it('stays quiet when nothing is unstaged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guard-clean-'))
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
    git('init', '-q')
    git('config', 'user.email', 'a@b.c')
    git('config', 'user.name', 'test')
    writeFileSync(join(dir, 'a.ts'), 'const x = 1\n')
    git('add', 'a.ts')
    git('commit', '-qm', 'first')
    expect(fire('git-restore-guard', { command: 'git checkout -- a.ts' }, { cwd: dir })).toBe('')
  })
})
