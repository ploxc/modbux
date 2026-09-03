/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// What the fake /etc/group holds. A string resolves, an Error rejects.
let groupFile: string | Error = 'root:x:0:\ndialout:x:20:someone\n'

// Which of the candidate pkexec paths "exist".
let existingPaths: string[] = ['/usr/bin/pkexec']

// Exit code the fake pkexec reports, and what ran.
let execExitCode = 0
const execFileCalls: { file: string; args: readonly string[] }[] = []

// The groups this "session" holds, as gids.
let sessionGroups: number[] = []

// What /dev holds, and which of those entries refuse to open.
let devEntries: string[] = ['ttyUSB0']
let unreadable: string[] = ['ttyUSB0']

// The gid that owns each device node, which is where the group name comes from.
let deviceGid = 20

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => {
    if (groupFile instanceof Error) throw groupFile
    return groupFile
  }),
  readdir: vi.fn(async () => devEntries),
  access: vi.fn(async (path: string) => {
    if (unreadable.some((name) => path.endsWith(name))) throw new Error('EACCES')
  }),
  stat: vi.fn(async () => ({ gid: deviceGid }))
}))

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => existingPaths.includes(path)),
  constants: { R_OK: 4, W_OK: 2 }
}))

vi.mock('os', () => ({
  userInfo: vi.fn(() => ({ username: 'jens' }))
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
  applySerialGroupFix,
  findUnreadablePorts,
  getSerialGroupStatus,
  readGroupEntry
} from '../serialGroup'

const originalPlatform = process.platform
const setPlatform = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })

beforeEach(() => {
  groupFile = 'root:x:0:\ndialout:x:20:someone\n'
  existingPaths = ['/usr/bin/pkexec']
  execExitCode = 0
  execFileCalls.length = 0
  sessionGroups = []
  devEntries = ['ttyUSB0']
  unreadable = ['ttyUSB0']
  deviceGid = 20
  setPlatform('linux')
  process.getgroups = () => sessionGroups
  delete process.env.FLATPAK_ID
  delete process.env.SNAP
})

afterEach(() => {
  setPlatform(originalPlatform)
  vi.clearAllMocks()
})

describe('readGroupEntry', () => {
  it('reads the gid and the members', async () => {
    groupFile = 'root:x:0:\ndialout:x:20:alice,bob\n'
    expect(await readGroupEntry('dialout')).toEqual({ gid: 20, members: ['alice', 'bob'] })
  })

  it('reports no members rather than an empty name', async () => {
    groupFile = 'dialout:x:20:\n'
    expect(await readGroupEntry('dialout')).toEqual({ gid: 20, members: [] })
  })

  it('returns undefined for a group that is not there', async () => {
    expect(await readGroupEntry('uucp')).toBeUndefined()
  })

  it('returns undefined when the file cannot be read', async () => {
    groupFile = new Error('ENOENT')
    expect(await readGroupEntry('dialout')).toBeUndefined()
  })

  it('skips a line with the name but no gid field', async () => {
    // Without the field the parse would have read `undefined` as the gid and
    // answered NaN, which the caller cannot tell from a real group.
    groupFile = 'dialout:x\ndialout:x:20:alice\n'
    expect(await readGroupEntry('dialout')).toEqual({ gid: 20, members: ['alice'] })
  })
})

describe('findUnreadablePorts', () => {
  it('reports a device that exists and will not open', async () => {
    expect(await findUnreadablePorts()).toEqual(['ttyUSB0'])
  })

  it('reports nothing when the device opens', async () => {
    unreadable = []
    expect(await findUnreadablePorts()).toEqual([])
  })

  it('ignores everything that is not a serial device', async () => {
    devEntries = ['null', 'sda', 'random']
    unreadable = ['null', 'sda', 'random']
    expect(await findUnreadablePorts()).toEqual([])
  })

  // Every Linux machine has these, hardware or not, and hardly any of them
  // open. Counting them means warning everyone, which is how the suite found
  // this the first time.
  it('ignores the legacy UARTs that exist everywhere', async () => {
    devEntries = ['ttyS0', 'ttyS1', 'ttyS31']
    unreadable = ['ttyS0', 'ttyS1', 'ttyS31']
    expect(await findUnreadablePorts()).toEqual([])
  })

  it('still reports an adapter beside them', async () => {
    devEntries = ['ttyS0', 'ttyACM0']
    unreadable = ['ttyS0', 'ttyACM0']
    expect(await findUnreadablePorts()).toEqual(['ttyACM0'])
  })
})

describe('getSerialGroupStatus', () => {
  it('reports nothing to do off Linux', async () => {
    setPlatform('darwin')
    const status = await getSerialGroupStatus()
    expect(status.supported).toBe(false)
    expect(status.needsMembership).toBe(false)
  })

  it('asks for membership when the user is neither listed nor holding it', async () => {
    const status = await getSerialGroupStatus()
    expect(status.needsMembership).toBe(true)
    expect(status.pendingLogin).toBe(false)
    expect(status.username).toBe('jens')
  })

  it('says nothing when the session already holds the group', async () => {
    sessionGroups = [20]
    const status = await getSerialGroupStatus()
    expect(status.needsMembership).toBe(false)
    expect(status.pendingLogin).toBe(false)
  })

  // What the e2e suite runs into: socat hands out ptys the user owns, so the
  // group has nothing to do with whether RTU works there.
  it('says nothing when every port opens, group or no group', async () => {
    unreadable = []
    const status = await getSerialGroupStatus()
    expect(status.needsMembership).toBe(false)
    expect(status.pendingLogin).toBe(false)
  })

  it('says nothing when there is no serial device at all', async () => {
    devEntries = []
    unreadable = []
    expect((await getSerialGroupStatus()).needsMembership).toBe(false)
  })

  // The case that separates "run the command" from "log out": usermod writes
  // the file at once, and the session keeps the groups it started with.
  it('waits for a login when the file lists the user and the session does not', async () => {
    groupFile = 'dialout:x:20:jens\n'
    const status = await getSerialGroupStatus()
    expect(status.pendingLogin).toBe(true)
    expect(status.needsMembership).toBe(false)
  })

  it('names the group the device belongs to, not an assumed dialout', async () => {
    // A distribution that calls it uucp, with no dialout anywhere in sight.
    groupFile = 'root:x:0:\nuucp:x:14:someone\n'
    deviceGid = 14

    const status = await getSerialGroupStatus()

    expect(status.group).toBe('uucp')
    expect(status.needsMembership).toBe(true)
  })

  it('says nothing when the session holds the group the device belongs to', async () => {
    groupFile = 'root:x:0:\nuucp:x:14:jens\n'
    deviceGid = 14
    sessionGroups = [14]

    const status = await getSerialGroupStatus()

    expect(status.needsMembership).toBe(false)
    expect(status.pendingLogin).toBe(false)
  })

  it('advises nothing when the gid that owns the device has no name', async () => {
    groupFile = 'root:x:0:\ndialout:x:20:someone\n'
    deviceGid = 999

    const status = await getSerialGroupStatus()

    expect(status.needsMembership).toBe(false)
    expect(status.pendingLogin).toBe(false)
  })

  it('advises nothing when the group does not exist', async () => {
    groupFile = 'root:x:0:\n'
    const status = await getSerialGroupStatus()
    expect(status.supported).toBe(true)
    expect(status.needsMembership).toBe(false)
    expect(status.canElevate).toBe(false)
  })

  it('reports a sandbox rather than offering a dead button', async () => {
    process.env.FLATPAK_ID = 'com.ploxc.modbux'
    const status = await getSerialGroupStatus()
    expect(status.sandbox).toBe('flatpak')
    expect(status.canElevate).toBe(false)
  })

  it('cannot elevate without pkexec', async () => {
    existingPaths = []
    expect((await getSerialGroupStatus()).canElevate).toBe(false)
  })
})

describe('applySerialGroupFix', () => {
  it('runs usermod for this user through pkexec', async () => {
    groupFile = 'dialout:x:20:jens\n'
    const result = await applySerialGroupFix()
    expect(result.ok).toBe(true)
    expect(execFileCalls[0]).toEqual({
      file: '/usr/bin/pkexec',
      args: ['usermod', '-aG', 'dialout', 'jens']
    })
  })

  it('adds the user to the group the device belongs to', async () => {
    groupFile = 'root:x:0:\nuucp:x:14:jens\n'
    deviceGid = 14

    const result = await applySerialGroupFix()

    expect(execFileCalls[0]?.args).toEqual(['usermod', '-aG', 'uucp', 'jens'])
    expect(result.ok).toBe(true)
    expect(result.message).toContain('uucp')
  })

  it('says to log out rather than claiming it is done', async () => {
    groupFile = 'dialout:x:20:jens\n'
    expect((await applySerialGroupFix()).message).toMatch(/log out/i)
  })

  // The exit code says the command ran, the file says whether it did anything.
  it('reports failure when the group still does not list the user', async () => {
    const result = await applySerialGroupFix()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('failed')
  })

  it('calls a dismissed prompt cancelled', async () => {
    execExitCode = 126
    const result = await applySerialGroupFix()
    expect(result.reason).toBe('cancelled')
    expect(result.message).toMatch(/nothing has changed/i)
  })

  it('calls a refused authorization cancelled too', async () => {
    execExitCode = 127
    expect((await applySerialGroupFix()).reason).toBe('cancelled')
  })

  it('reports any other exit code as a failure', async () => {
    execExitCode = 1
    const result = await applySerialGroupFix()
    expect(result.reason).toBe('failed')
    expect(result.message).toMatch(/exited with code 1/)
  })

  it('refuses inside a sandbox without running anything', async () => {
    process.env.SNAP = '/snap/modbux'
    const result = await applySerialGroupFix()
    expect(result.reason).toBe('unavailable')
    expect(execFileCalls).toHaveLength(0)
  })

  it('refuses without pkexec without running anything', async () => {
    existingPaths = []
    const result = await applySerialGroupFix()
    expect(result.reason).toBe('unavailable')
    expect(execFileCalls).toHaveLength(0)
  })

  it('does nothing off Linux', async () => {
    setPlatform('win32')
    expect((await applySerialGroupFix()).reason).toBe('unsupported')
  })
})
