/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  unitIdField,
  navigateToServer,
  navigateToClient,
  cleanServerState,
  loadServerConfig,
  disconnectClient,
  readRegisters,
  selectRegisterType,
  selectUnitId,
  expectCell,
  selectProtocol,
  setBitWidth
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { SOCAT_PATH, hasSocat } from '../../fixtures/socat'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
// The gateway carries real RTU frames, so unit 0 is the broadcast address here
// and the server hosts nothing on it. Same config, moved to unit 1.
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-basic-unit1.json')

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

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

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

  test('load basic server config on unit 1', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await mainPage.waitForTimeout(500)
    await selectUnitId(mainPage, '1')

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

    // The protocol select is disabled once connected, so it is set first.
    await selectProtocol(mainPage, 'ModbusRtuOverTcp')
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()

    await selectRegisterType(mainPage, 'Holding Registers')

    await setBitWidth(mainPage, '32', true)
  })

  test('connect to the gateway over TCP', async ({ mainPage }) => {
    await mainPage.getByTestId('tcp-host-input').locator('input').fill('127.0.0.1')
    await mainPage.getByTestId('tcp-port-input').locator('input').fill(TCP_PORT)
    await (await unitIdField(mainPage)).fill('1')

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
    await selectProtocol(mainPage, 'ModbusTcp')
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
