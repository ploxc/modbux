/**
 * Cancelling a connect
 *
 * The Connect button is a Cancel for as long as the state is 'connecting', and
 * it sends `disconnect`. On RTU a cancelled connect that finishes its open
 * anyway reports "Connected over Modbus RTU" over the cancel, leaving the
 * button on Disconnect and the port held.
 *
 * Both calls go through `window.api` in one tick, which is the window the
 * button opens while a port is opening.
 */
import { test, expect } from '../../fixtures/electron-app'
import type { Page } from '@playwright/test'
import {
  cleanServerState,
  connectClientRTU,
  disconnectClient,
  navigateToClient,
  navigateToServer
} from '../../fixtures/helpers'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'
import { SOCAT_PATH, hasSocat } from '../../fixtures/socat'

const PTY_0 = '/tmp/ttyVCANCEL0'
const PTY_1 = '/tmp/ttyVCANCEL1'

const SNACKBARS = '.notistack-SnackbarContainer'

/** Every snackbar raised over the next two seconds, read as they come. */
async function snackbarsOver(p: Page, milliseconds: number): Promise<string> {
  const seen: string[] = []
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    const text = await p
      .locator(SNACKBARS)
      .textContent({ timeout: 100 })
      .catch(() => null)
    if (text) seen.push(text)
    await p.waitForTimeout(50)
  }
  return [...new Set(seen)].join(' | ')
}

/**
 * Closes every snackbar on screen. `preventDuplicate` drops a message whose
 * text is still showing, so a "Connected over" left by an earlier spec both
 * reads as raised here and hides one that is. On a CI runner a closed
 * snackbar can stay in the DOM hidden, so only a visible close button is
 * pressed, and afterwards no container may hold the text, hidden or not.
 */
async function closeSnackbars(p: Page): Promise<void> {
  const close = p.getByTestId('snackbar-close-btn').filter({ visible: true })
  await expect(async () => {
    const count = await close.count()
    if (count > 0) await close.first().click()
    expect(count).toBe(0)
  }).toPass({ timeout: 10_000 })
  await expect(p.locator(SNACKBARS, { hasText: 'Connected over' })).toHaveCount(0)
}

test.describe.serial('Cancelling a connect', () => {
  test.skip(!hasSocat, 'socat not available')

  let socatProcess: ChildProcess | null = null

  test('start socat virtual serial pair', async () => {
    for (const pty of [PTY_0, PTY_1]) {
      try {
        unlinkSync(pty)
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
      await new Promise((r) => setTimeout(r, 100))
    }

    expect(existsSync(PTY_0)).toBe(true)
    expect(existsSync(PTY_1)).toBe(true)
  })

  test('put the server on the pty', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
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

  test('a cancelled connect stays disconnected', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClientRTU(mainPage, '0', '9600', 'none', '8', '1')
    await mainPage.getByTestId('rtu-com-input').locator('input').fill(PTY_1)
    await closeSnackbars(mainPage)

    await mainPage.evaluate(() => {
      window.api.connect()
      window.api.disconnect()
    })

    const raised = await snackbarsOver(mainPage, 2000)
    expect(raised).not.toContain('Connected over')
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Connect')
  })

  test('and the port it let go of takes a connect', async ({ mainPage }) => {
    await mainPage.getByTestId('connect-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Disconnect', {
      timeout: 10_000
    })
    await disconnectClient(mainPage)
  })

  test('cleanup: back to TCP, stop socat', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await navigateToServer(mainPage)
    await mainPage.getByTestId('server-mode-tcp-btn').click()

    if (socatProcess) {
      socatProcess.kill()
      socatProcess = null
    }
    for (const pty of [PTY_0, PTY_1]) {
      try {
        unlinkSync(pty)
      } catch {
        /* ignore */
      }
    }
  })
})
