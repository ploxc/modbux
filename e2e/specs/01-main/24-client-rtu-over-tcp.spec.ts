/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToServer,
  navigateToClient,
  cleanServerState,
  loadServerConfig,
  disconnectClient,
  readRegisters,
  selectRegisterType,
  expectCell
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-basic.json')

const SOCAT_PATHS = ['/usr/local/bin/socat', '/usr/bin/socat']
const SOCAT_PATH = SOCAT_PATHS.find((p) => existsSync(p)) ?? SOCAT_PATHS[0]
const hasSocat = existsSync(SOCAT_PATH)

// A serial-to-Ethernet gateway in transparent mode passes raw RTU frames (with
// CRC) between a TCP socket and a serial line. A single socat instance emulates
// exactly that: one side is a PTY the Modbux RTU server listens on, the other
// is a TCP listener the Modbux "RTU over TCP" client connects to. socat relays
// the bytes verbatim, so the RTU framing matches end to end.
//
//   Modbux RTU server ──(pty /tmp/ttyVRTU)── socat ──(tcp 15020)── Modbux RTU-over-TCP client
//
// This is the only way to exercise the RTU-over-TCP transport for real: it
// cannot be validated against Modbux's own ServerTCP, which speaks MBAP.
const PTY = '/tmp/ttyVRTU'
const TCP_PORT = '15020'

test.describe.serial('Client RTU over TCP — round-trip via socat gateway', () => {
  test.skip(!hasSocat, 'socat not available')

  let socatProcess: ChildProcess | null = null

  // ─── socat gateway lifecycle ───────────────────────────────────────

  test('start socat TCP↔serial gateway', async () => {
    try {
      unlinkSync(PTY)
    } catch {
      /* ignore */
    }

    // address1 (pty) opens immediately so the RTU server can attach before any
    // client connects; address2 (tcp-listen) blocks on accept until the client
    // dials in.
    socatProcess = spawn(SOCAT_PATH, [
      '-d',
      '-d',
      `pty,raw,echo=0,link=${PTY}`,
      `tcp-listen:${TCP_PORT},reuseaddr`
    ])

    // Poll for the pty symlink to appear (max 2s)
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (existsSync(PTY)) break
      await new Promise((r) => setTimeout(r, 100))
    }

    expect(existsSync(PTY)).toBe(true)
  })

  // ─── Server setup (RTU on the pty side) ────────────────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load basic server config', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await mainPage.waitForTimeout(500)

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
  })

  test('switch server to RTU mode on the pty', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-rtu-btn').click()
    const comInput = mainPage.getByTestId('server-rtu-com-input').locator('input')
    await expect(comInput).toBeVisible()
    await comInput.fill(PTY)
    await comInput.blur()
  })

  test('RTU server reports active', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-rtu-status')).toHaveAttribute(
      'title',
      'RTU server active',
      { timeout: 5000 }
    )
  })

  // ─── Client setup (RTU over TCP on the socket side) ────────────────

  test('navigate to client and enable RTU over TCP', async ({ mainPage }) => {
    await navigateToClient(mainPage)

    // Ensure a TCP baseline (state persists across specs in the same worker),
    // then enable RTU over TCP + advanced mode from the ⚙ options menu. Both
    // must be set while disconnected — the RTU-over-TCP toggle is disabled once
    // connected. `.check()` is idempotent, so prior state can't flip it off.
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()

    await selectRegisterType(mainPage, 'Holding Registers')

    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('rtu-over-tcp-checkbox').locator('input').check()
    await mainPage.getByTestId('advanced-mode-checkbox').locator('input').check()
    await mainPage.keyboard.press('Escape')
  })

  test('connect to the gateway over TCP', async ({ mainPage }) => {
    await mainPage.getByTestId('tcp-host-input').locator('input').fill('127.0.0.1')
    await mainPage.getByTestId('tcp-port-input').locator('input').fill(TCP_PORT)
    await mainPage.getByTestId('client-unitid-input').locator('input').fill('0')

    await mainPage.getByTestId('connect-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Disconnect', {
      timeout: 10_000
    })
  })

  // ─── Round-trip reads ──────────────────────────────────────────────

  test('read holding registers 0-1', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '2')

    // setpoint (int16 @ 0) = 100
    await expectCell(mainPage, 0, 'hex', '0064')
    await expectCell(mainPage, 0, 'word_int16', '100')

    // counter (uint16 @ 1) = 500
    await expectCell(mainPage, 1, 'hex', '01F4')
    await expectCell(mainPage, 1, 'word_uint16', '500')
  })

  test('read input register 0', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await selectRegisterType(mainPage, 'Input Registers')
    await readRegisters(mainPage, '0', '1')

    // temperature (int16 @ 0) = 200
    await expectCell(mainPage, 0, 'hex', '00C8')
    await expectCell(mainPage, 0, 'word_int16', '200')
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('disconnect client', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  test('disable RTU over TCP (back to plain TCP)', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('rtu-over-tcp-checkbox').locator('input').uncheck()
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('protocol-tcp-btn')).toHaveClass(/Mui-selected/)
  })

  test('switch server back to TCP', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await mainPage.getByTestId('server-mode-tcp-btn').click()
    await expect(mainPage.getByTestId('server-port-input')).toBeVisible()
  })

  test('stop socat + remove symlink', async () => {
    if (socatProcess) {
      socatProcess.kill()
      socatProcess = null
    }
    try {
      unlinkSync(PTY)
    } catch {
      /* ignore */
    }
    expect(existsSync(PTY)).toBe(false)
  })
})
