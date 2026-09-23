import { test, expect } from '../../fixtures/electron-app'
import type { Page } from '@playwright/test'
import {
  navigateToServer,
  navigateToClient,
  cleanServerState,
  connectClientRTU,
  disconnectClient
} from '../../fixtures/helpers'
import { spawn, execSync, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { SOCAT_PATH, hasSocat } from '../../fixtures/socat'

const PTY_0 = '/tmp/ttyV0'
const PTY_1 = '/tmp/ttyV1'

/**
 * The cflags this spec reads, on and off, so a failure prints the whole set
 * rather than one missing token.
 */
const CFLAGS = [
  'cs5',
  'cs6',
  'cs7',
  'cs8',
  'parenb',
  '-parenb',
  'parodd',
  '-parodd',
  'cstopb',
  '-cstopb'
] as const

/**
 * The line settings the port at `path` is currently open with.
 *
 * `tcsetattr` writes them onto the pty, so `stty` reads back what the binding
 * applied rather than what Modbux believes it sent. On macOS, opening one end of
 * a socat pair at 19200 7E2 gives `speed 19200` and `cs7 parenb cstopb`, while
 * the other end stays at the 9600 cs8 socat left it.
 *
 * `-a` is what makes an off flag appear as `-parenb`; without it both stty
 * implementations print only what differs from their own idea of sane. BSD
 * reads a device with `-f` and GNU with `-F`.
 */
const lineSettings = (path: string): { speed: number; flags: string[] } => {
  const deviceFlag = process.platform === 'darwin' ? '-f' : '-F'
  const output = execSync(`stty -a ${deviceFlag} ${path}`, { encoding: 'utf8', timeout: 5000 })
  const tokens = new Set(output.split(/[\s,;]+/))
  return {
    speed: Number(/speed (\d+) baud/.exec(output)?.[1]),
    flags: CFLAGS.filter((flag) => tokens.has(flag))
  }
}

/**
 * The flags a Linux pty does not keep. Measured with `tcsetattr` on a socat pty
 * on kernel 7.0.0-30: every frame this spec sets reads back `cs8 -parenb`, while
 * the speed, `cstopb` and `parodd` read back as set.
 */
const PTY_DROPS: readonly string[] =
  process.platform === 'linux' ? ['cs5', 'cs6', 'cs7', 'cs8', 'parenb', '-parenb'] : []

/**
 * Assert what a port opened with, retrying while the server restarts.
 *
 * Every select restarts the RTU server, so the pty holds the previous frame
 * until the new one lands, and a read between the close and the open throws.
 * `toPass` covers both.
 */
const expectLineSettings = async (
  path: string,
  expected: { speed: number; flags: string[] }
): Promise<void> => {
  const kept = expected.flags.filter((flag) => !PTY_DROPS.includes(flag))
  await expect(async () => {
    const actual = lineSettings(path)
    expect(actual.speed).toBe(expected.speed)
    for (const flag of kept) expect(actual.flags).toContain(flag)
  }).toPass({ timeout: 10_000 })
}

type SerialUi = { baudRate: string; parity: string; dataBits: string; stopBits: string }

/** Drive the server's four serial selects. Each one restarts the RTU server. */
const applyServerSerial = async (p: Page, ui: SerialUi): Promise<void> => {
  const selects: [string, string][] = [
    ['server-rtu-baudrate-select', ui.baudRate],
    ['server-rtu-parity-select', ui.parity],
    ['server-rtu-databits-select', ui.dataBits],
    ['server-rtu-stopbits-select', ui.stopBits]
  ]

  for (const [testId, option] of selects) {
    await p.getByTestId(testId).click()
    await p.getByRole('option', { name: option, exact: true }).click()
    await expect(p.getByTestId(testId)).toContainText(option)
  }
}

/**
 * Each case changes every axis the one before it set, so no assertion can pass
 * on a frame left behind by the previous open. Together they cover all four
 * data bit widths, both stop bit counts and all three parities.
 *
 * `parodd` is asserted only where `parenb` is on. Measured: the binding clears
 * `parenb` for no parity and leaves the parity bit where the previous open put
 * it, so a `-parodd` here would be asserting the case above.
 */
const CASES: { name: string; ui: SerialUi; speed: number; flags: string[] }[] = [
  {
    name: '19200 7E2',
    ui: { baudRate: '19200', parity: 'even', dataBits: '7', stopBits: '2' },
    speed: 19200,
    flags: ['cs7', 'parenb', '-parodd', 'cstopb']
  },
  {
    name: '115200 8O1',
    ui: { baudRate: '115200', parity: 'odd', dataBits: '8', stopBits: '1' },
    speed: 115200,
    flags: ['cs8', 'parenb', 'parodd', '-cstopb']
  },
  {
    name: '4800 6N1',
    ui: { baudRate: '4800', parity: 'none', dataBits: '6', stopBits: '1' },
    speed: 4800,
    flags: ['cs6', '-parenb', '-cstopb']
  },
  {
    name: '2400 5N2',
    ui: { baudRate: '2400', parity: 'none', dataBits: '5', stopBits: '2' },
    speed: 2400,
    flags: ['cs5', '-parenb', 'cstopb']
  }
]

test.describe.serial('Serial line settings — what reaches the port', () => {
  test.skip(!hasSocat, 'socat not available')

  let socatProcess: ChildProcess | null = null

  test('start socat virtual serial pair', async () => {
    for (const link of [PTY_0, PTY_1]) {
      try {
        unlinkSync(link)
      } catch {
        /* ignore */
      }
    }

    socatProcess = spawn(SOCAT_PATH, [
      '-d',
      '-d',
      `pty,raw,echo=0,link=${PTY_0}`,
      `pty,raw,echo=0,link=${PTY_1}`
    ])

    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (existsSync(PTY_0) && existsSync(PTY_1)) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    expect(existsSync(PTY_0)).toBe(true)
    expect(existsSync(PTY_1)).toBe(true)
  })

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('put the server on the pty', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-rtu-btn').click()
    await expect(mainPage.getByTestId('server-rtu-com-input')).toBeVisible()

    const comInput = mainPage.getByTestId('server-rtu-com-input').locator('input')
    await comInput.fill(PTY_0)
    await comInput.blur()

    await expect(mainPage.getByTestId('server-rtu-status')).toHaveAttribute(
      'title',
      'RTU server active',
      { timeout: 5000 }
    )
  })

  // ─── The server end ───────────────────────────────────────────────────────

  for (const serialCase of CASES) {
    test(`the port opens at ${serialCase.name}`, async ({ mainPage }) => {
      await applyServerSerial(mainPage, serialCase.ui)
      await expectLineSettings(PTY_0, serialCase)
    })
  }

  // ─── The client end ───────────────────────────────────────────────────────

  test('the client opens at the settings it was given', async ({ mainPage }) => {
    // The other end of the same pair, and a frame none of the server cases set,
    // so what is read here cannot have come from the server.
    await navigateToClient(mainPage)
    await connectClientRTU(mainPage, '1', '38400', 'even', '8', '2')

    const comInput = mainPage.getByTestId('rtu-com-input').locator('input')
    await comInput.fill(PTY_1)

    await mainPage.getByTestId('connect-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Disconnect', {
      timeout: 10_000
    })

    await expectLineSettings(PTY_1, {
      speed: 38400,
      flags: ['cs8', 'parenb', '-parodd', 'cstopb']
    })
  })

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  test('disconnect the client and switch it back to TCP', async ({ mainPage }) => {
    await disconnectClient(mainPage)
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()
  })

  test('restore the server defaults and switch back to TCP', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await applyServerSerial(mainPage, {
      baudRate: '9600',
      parity: 'none',
      dataBits: '8',
      stopBits: '1'
    })

    await mainPage.getByTestId('server-mode-tcp-btn').click()
    await expect(mainPage.getByTestId('server-port-input')).toBeVisible()
  })

  test('stop socat + remove symlinks', async () => {
    if (socatProcess) {
      socatProcess.kill()
      socatProcess = null
    }

    for (const link of [PTY_0, PTY_1]) {
      try {
        unlinkSync(link)
      } catch {
        /* ignore */
      }
    }
  })
})
