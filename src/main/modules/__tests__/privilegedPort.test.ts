/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// What the fake /proc read returns. A string resolves, an Error rejects.
let procContent: string | Error = '1024'

// Which of the candidate pkexec paths "exist".
let existingPaths: string[] = ['/usr/bin/pkexec']

// Exit code the fake pkexec reports. 0 means success.
let execExitCode = 0
const execFileCalls: { file: string; args: readonly string[] }[] = []

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => {
    if (procContent instanceof Error) throw procContent
    return procContent
  })
}))

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => existingPaths.includes(path))
}))

vi.mock('child_process', () => ({
  execFile: vi.fn(
    (
      file: string,
      args: readonly string[],
      _options: unknown,
      cb: (error: (Error & { code?: number }) | null) => void
    ) => {
      execFileCalls.push({ file, args })
      if (execExitCode === 0) return cb(null)
      const error = new Error(`exited ${execExitCode}`) as Error & { code?: number }
      error.code = execExitCode
      cb(error)
    }
  )
}))

import {
  applyPrivilegedPortFix,
  detectSandbox,
  findPkexec,
  getPrivilegedPortStatus,
  readUnprivilegedPortStart
} from '../privilegedPort'
import {
  privilegedPortCommandArgs,
  privilegedPortCommandDisplay,
  UNPRIVILEGED_PORT_CONF_PATH
} from '@shared'

/** process.platform is read-only, so redefine it for the duration of a test. */
const setPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

const realPlatform = process.platform

beforeEach(() => {
  procContent = '1024'
  existingPaths = ['/usr/bin/pkexec']
  execExitCode = 0
  execFileCalls.length = 0
  delete process.env.FLATPAK_ID
  delete process.env.SNAP
  setPlatform('linux')
})

afterEach(() => {
  setPlatform(realPlatform)
  vi.clearAllMocks()
})

// ─── readUnprivilegedPortStart ───────────────────────────────────────

describe('readUnprivilegedPortStart', () => {
  it('parses the kernel value', async () => {
    procContent = '1024\n'
    expect(await readUnprivilegedPortStart()).toBe(1024)
  })

  it('parses an already-lowered value', async () => {
    procContent = '502\n'
    expect(await readUnprivilegedPortStart()).toBe(502)
  })

  it('returns undefined when the file is unreadable', async () => {
    procContent = new Error('ENOENT')
    expect(await readUnprivilegedPortStart()).toBeUndefined()
  })

  it('returns undefined on unparseable content', async () => {
    procContent = 'not-a-number'
    expect(await readUnprivilegedPortStart()).toBeUndefined()
  })

  it('returns undefined off Linux without touching the filesystem', async () => {
    setPlatform('darwin')
    expect(await readUnprivilegedPortStart()).toBeUndefined()
  })
})

// ─── detectSandbox ───────────────────────────────────────────────────

describe('detectSandbox', () => {
  it('detects Flatpak', () => {
    process.env.FLATPAK_ID = 'com.example.Modbux'
    expect(detectSandbox()).toBe('flatpak')
  })

  it('detects Snap', () => {
    process.env.SNAP = '/snap/modbux/current'
    expect(detectSandbox()).toBe('snap')
  })

  it('returns undefined outside a sandbox', () => {
    expect(detectSandbox()).toBeUndefined()
  })
})

// ─── findPkexec ──────────────────────────────────────────────────────

describe('findPkexec', () => {
  it('finds pkexec on the usual path', () => {
    expect(findPkexec()).toBe('/usr/bin/pkexec')
  })

  it('falls back to /usr/local/bin', () => {
    existingPaths = ['/usr/local/bin/pkexec']
    expect(findPkexec()).toBe('/usr/local/bin/pkexec')
  })

  it('returns undefined when pkexec is missing', () => {
    existingPaths = []
    expect(findPkexec()).toBeUndefined()
  })
})

// ─── getPrivilegedPortStatus ─────────────────────────────────────────

describe('getPrivilegedPortStatus', () => {
  it('flags port 502 as needing elevation under the default floor', async () => {
    const status = await getPrivilegedPortStatus(502)
    expect(status).toMatchObject({
      port: 502,
      supported: true,
      unprivilegedPortStart: 1024,
      needsElevation: true,
      canElevate: true
    })
  })

  it('clears the flag once the floor has been lowered', async () => {
    procContent = '502'
    const status = await getPrivilegedPortStatus(502)
    expect(status.needsElevation).toBe(false)
  })

  it('does not flag a port at or above the floor', async () => {
    expect((await getPrivilegedPortStatus(1024)).needsElevation).toBe(false)
    expect((await getPrivilegedPortStatus(10502)).needsElevation).toBe(false)
  })

  it('reports unsupported off Linux', async () => {
    setPlatform('win32')
    const status = await getPrivilegedPortStatus(502)
    expect(status).toMatchObject({ supported: false, needsElevation: false, canElevate: false })
  })

  it('does not guess when the kernel value is unreadable', async () => {
    procContent = new Error('ENOENT')
    const status = await getPrivilegedPortStatus(502)
    expect(status.needsElevation).toBe(false)
    expect(status.unprivilegedPortStart).toBeUndefined()
  })

  it('cannot elevate inside a sandbox even with pkexec present', async () => {
    process.env.FLATPAK_ID = 'com.example.Modbux'
    const status = await getPrivilegedPortStatus(502)
    expect(status.needsElevation).toBe(true)
    expect(status.canElevate).toBe(false)
    expect(status.sandbox).toBe('flatpak')
  })

  it('cannot elevate without pkexec', async () => {
    existingPaths = []
    expect((await getPrivilegedPortStatus(502)).canElevate).toBe(false)
  })
})

// ─── command construction ────────────────────────────────────────────

describe('privilegedPortCommand', () => {
  it('builds a plain sysctl call for the session mode', () => {
    expect(privilegedPortCommandArgs('session')).toEqual([
      'sysctl',
      'net.ipv4.ip_unprivileged_port_start=502'
    ])
  })

  it('writes a sysctl.d drop-in for the persist mode', () => {
    const args = privilegedPortCommandArgs('persist')
    expect(args[0]).toBe('sh')
    expect(args[1]).toBe('-c')
    expect(args[2]).toContain(UNPRIVILEGED_PORT_CONF_PATH)
    expect(args[2]).toContain('sysctl --system')
  })

  it('displays the command that would actually run', () => {
    expect(privilegedPortCommandDisplay('session')).toBe(
      'pkexec sysctl net.ipv4.ip_unprivileged_port_start=502'
    )
    expect(privilegedPortCommandDisplay('persist')).toContain("pkexec sh -c '")
  })
})

// ─── applyPrivilegedPortFix ──────────────────────────────────────────

describe('applyPrivilegedPortFix', () => {
  it('runs pkexec with the session command and reports the new floor', async () => {
    procContent = '1024'
    const pending = applyPrivilegedPortFix('session')
    // The re-read after a successful run sees the lowered value.
    procContent = '502'
    const result = await pending

    expect(result.ok).toBe(true)
    expect(result.unprivilegedPortStart).toBe(502)
    expect(execFileCalls[0]?.file).toBe('/usr/bin/pkexec')
    expect(execFileCalls[0]?.args).toEqual(privilegedPortCommandArgs('session'))
  })

  it('runs the persist command when asked to', async () => {
    await applyPrivilegedPortFix('persist')
    expect(execFileCalls[0]?.args).toEqual(privilegedPortCommandArgs('persist'))
  })

  it('says so when the user dismisses the PolicyKit prompt', async () => {
    execExitCode = 126
    const result = await applyPrivilegedPortFix('session')
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' })
  })

  it('treats a failed authorization as cancelled', async () => {
    execExitCode = 127
    const result = await applyPrivilegedPortFix('session')
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' })
  })

  it('reports any other non-zero exit as a failure', async () => {
    execExitCode = 1
    const result = await applyPrivilegedPortFix('session')
    expect(result).toMatchObject({ ok: false, reason: 'failed' })
    expect(result.message).toContain('1')
  })

  it('refuses inside a sandbox without running anything', async () => {
    process.env.SNAP = '/snap/modbux/current'
    const result = await applyPrivilegedPortFix('session')
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(result.message).toContain('Snap')
    expect(execFileCalls).toHaveLength(0)
  })

  it('refuses when pkexec is missing', async () => {
    existingPaths = []
    const result = await applyPrivilegedPortFix('session')
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(execFileCalls).toHaveLength(0)
  })

  it('refuses off Linux', async () => {
    setPlatform('darwin')
    const result = await applyPrivilegedPortFix('session')
    expect(result).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(execFileCalls).toHaveLength(0)
  })

  it('never throws, whatever the outcome', async () => {
    execExitCode = 99
    await expect(applyPrivilegedPortFix('persist')).resolves.toBeDefined()
  })
})
