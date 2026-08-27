/**
 * Manual E2E — the privileged port modal
 *
 * The modal only appears when the kernel refuses port 502, so the run pauses
 * and asks you to change `net.ipv4.ip_unprivileged_port_start` in a terminal,
 * the same way the hardware specs pause for a COM port. sudo needs a real TTY,
 * so it cannot be scripted from here.
 *
 * Run headed, so the Playwright Inspector is there to resume from:
 *   yarn test:e2e:privileged-port
 *
 * The last step uses the modal's own Allow button to put the floor back to 502
 * in `session` mode — testing the real pkexec path and restoring the machine in
 * one go. It raises a PolicyKit password prompt.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { launchOptions } from '../../fixtures/launch'
import { navigateToServer } from '../../fixtures/helpers'
import { readFileSync } from 'fs'

const PROC_PATH = '/proc/sys/net/ipv4/ip_unprivileged_port_start'

const MODAL = 'privileged-port-modal'

let app: ElectronApplication
let page: Page

function kernelFloor(): number {
  return Number(readFileSync(PROC_PATH, 'utf8').trim())
}

async function launchApp(clearStorage = true): Promise<void> {
  app = await electron.launch(launchOptions())
  if (clearStorage) {
    await app.evaluate((ctx) =>
      ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
    )
  }
  // firstWindow() can hand back a window that is already on its way out, so
  // wait for the real main window the way the hardware specs do.
  let found: Page | undefined
  for (let attempt = 0; attempt < 10 && !found; attempt++) {
    const ready = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Modbux')
    )
    if (ready && app.windows().length === 1) found = app.windows()[0]
    else await new Promise((r) => setTimeout(r, 1000))
  }
  if (!found) throw new Error('Modbux main window not found!')

  page = found
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

async function closeApp(): Promise<void> {
  await app.close().catch(() => {})
  await new Promise((r) => setTimeout(r, 500))
}

/**
 * The modal opens off the back of an async IPC round-trip, so it is never
 * there the instant the view renders. Always wait for it rather than assuming
 * a previous test left it open.
 */
async function waitForModal(p: Page): Promise<void> {
  await expect(p.getByTestId(MODAL)).toBeVisible({ timeout: 10_000 })
}

function banner(lines: string[]): void {
  const width = Math.max(...lines.map((l) => l.length))
  const bar = '═'.repeat(width + 2)
  // eslint-disable-next-line no-console
  console.log(
    `\n╔${bar}╗\n` + lines.map((l) => `║ ${l.padEnd(width)} ║`).join('\n') + `\n╚${bar}╝\n`
  )
}

// The whole feature is Linux-only: getPrivilegedPortStatus reports
// supported: false everywhere else, so the modal can never open.
test.describe.serial('Privileged port modal (manual, Linux only)', () => {
  test.skip(process.platform !== 'linux', 'Linux-only feature')

  test.afterAll(async () => {
    if (app) await app.close().catch(() => {})
  })

  // ─── Block the port ────────────────────────────────────────────────

  test('pause — raise the port floor so 502 is blocked', async () => {
    await launchApp()

    // A rerun after a failure part-way through does not need the sudo step again.
    if (kernelFloor() > 502) {
      await closeApp()
      return
    }

    banner([
      'MANUAL STEP: block port 502',
      '',
      'In a terminal with a TTY, run:',
      '',
      '  sudo sysctl net.ipv4.ip_unprivileged_port_start=1024',
      '',
      'Then click "Resume" in the Playwright Inspector.'
    ])
    await page.pause()

    expect(kernelFloor(), 'floor must be above 502 for this spec to mean anything').toBeGreaterThan(
      502
    )
    await closeApp()
  })

  // ─── The modal ─────────────────────────────────────────────────────

  test('modal appears on the server view', async () => {
    await launchApp()
    await navigateToServer(page)
    await waitForModal(page)
  })

  test('the command shown matches the selected mode', async () => {
    const command = page.getByTestId('privileged-port-command')

    // persist is the default: a sysctl.d drop-in that survives a reboot
    await expect(page.getByTestId('privileged-port-mode-persist')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(command).toContainText('/etc/sysctl.d/50-unprivileged-ports.conf')
    await expect(command).toContainText('sysctl --system')

    // session is the until-reboot variant
    await page.getByTestId('privileged-port-mode-session').click()
    await expect(command).toContainText('net.ipv4.ip_unprivileged_port_start=502')
    await expect(command).not.toContainText('/etc/sysctl.d')
  })

  test('cancel closes it and it returns on the next launch', async () => {
    await page.getByTestId('privileged-port-cancel-btn').click()
    await expect(page.getByTestId(MODAL)).toBeHidden()
    await closeApp()

    // Storage kept: without "don't ask again" it must ask again.
    await launchApp(false)
    await navigateToServer(page)
    await waitForModal(page)
  })

  test('"don\'t ask again" survives a restart', async () => {
    await waitForModal(page)
    await page.getByTestId('privileged-port-dont-ask').click()
    await page.getByTestId('privileged-port-cancel-btn').click()
    await expect(page.getByTestId(MODAL)).toBeHidden()

    await closeApp()
    await launchApp(false)
    await navigateToServer(page)
    await page.waitForTimeout(2000)
    await expect(page.getByTestId(MODAL)).toBeHidden()
  })

  // ─── Fix it through the modal itself ───────────────────────────────

  test('Allow runs pkexec and unblocks the port', async () => {
    // Clear the dismissal so the modal comes back.
    await closeApp()
    await launchApp()
    await navigateToServer(page)
    await waitForModal(page)

    // session mode: restores the floor this machine was already on, rather
    // than writing a drop-in the spec never asked the user about.
    await page.getByTestId('privileged-port-mode-session').click()

    banner([
      'MANUAL STEP: a PolicyKit password prompt is about to appear',
      '',
      'Enter your password to let pkexec lower the port floor.',
      'Cancelling it is fine too — the modal should report that.'
    ])

    await page.getByTestId('privileged-port-allow-btn').click()

    // The main process re-reads /proc rather than trusting the exit code.
    await expect
      .poll(kernelFloor, { timeout: 0, message: 'kernel floor should drop to 502' })
      .toBeLessThanOrEqual(502)

    await closeApp()
  })

  test('modal stays away once the port is free', async () => {
    await launchApp()
    await navigateToServer(page)
    await page.waitForTimeout(2000)
    await expect(page.getByTestId(MODAL)).toBeHidden()
    await closeApp()
  })
})
