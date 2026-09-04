import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import net from 'net'
import { keepOutput } from '../../fixtures/electron-app'
import { launchOptions, ownProfileDir } from '../../fixtures/launch'
import { connectClient, navigateToClient, navigateToServer } from '../../fixtures/helpers'

/**
 * What the app does on macos once its last window is gone.
 *
 * `window-all-closed` quits on every other platform, so only here does the app
 * outlive its windows, and only here can a handle to a destroyed one still be
 * read. Nothing else in the suite reaches that state: `10-split-view` closes
 * the server window and leaves the main one standing.
 */
test.skip(process.platform !== 'darwin', 'the app quits with its last window everywhere else')

let app: ElectronApplication
let page: Page
let profile: string

let device: net.Server
let devicePort: number
let requestsSeen = 0

let master: net.Socket
const masterEvents: string[] = []
let modbuxServerPort: number

/**
 * A Modbus TCP device that answers a register read and counts what it was
 * asked.
 *
 * The count is the only witness that the client kept polling with no window
 * open: the client's state lives in main, and `electronApp.evaluate` reaches
 * electron rather than the app's own modules. An answer to a read is one MBAP
 * header, the function code back, a byte count and the data, and echoing the
 * function code answers a holding and an input register read alike.
 */
function startDevice(): Promise<void> {
  device = net.createServer((socket) => {
    socket.on('data', (request) => {
      requestsSeen++
      const transactionId = request.readUInt16BE(0)
      const unitId = request.readUInt8(6)
      const functionCode = request.readUInt8(7)
      const registerCount = request.readUInt16BE(10)
      const byteCount = registerCount * 2

      const response = Buffer.alloc(9 + byteCount)
      response.writeUInt16BE(transactionId, 0)
      response.writeUInt16BE(0, 2)
      response.writeUInt16BE(3 + byteCount, 4)
      response.writeUInt8(unitId, 6)
      response.writeUInt8(functionCode, 7)
      response.writeUInt8(byteCount, 8)
      socket.write(response)
    })
  })

  return new Promise((resolve) => {
    device.listen(0, '127.0.0.1', () => {
      const address = device.address()
      if (address === null || typeof address === 'string') throw new Error('device has no port')
      devicePort = address.port
      resolve()
    })
  })
}

async function windowCount(): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
}

/**
 * Playwright learns about a window after the app has built it, and it keeps the
 * closed ones in `windows()`, so both counts have to arrive before the page is
 * the one to drive.
 */
async function waitForWindow(): Promise<Page> {
  const openPages = (): Page[] => app.windows().filter((w) => !w.isClosed())

  await expect.poll(windowCount, { timeout: 15000 }).toBe(1)
  await expect.poll(() => openPages().length, { timeout: 15000 }).toBe(1)

  const [firstWindow] = openPages()
  if (!firstWindow) throw new Error('the app reports a window and playwright has none')
  await firstWindow.waitForLoadState('domcontentloaded')
  return firstWindow
}

test.describe.serial('macOS dock — the app outlives its windows', () => {
  test.beforeAll(async () => {
    await startDevice()
    profile = ownProfileDir()
    app = await electron.launch(launchOptions(profile))
    keepOutput(app)
    page = await waitForWindow()
    await page.waitForTimeout(500)
  })

  test.afterAll(async () => {
    master?.destroy()
    await app?.close().catch(() => {})
    await new Promise<void>((resolve) => device.close(() => resolve()))
  })

  test('a master outside modbux connects to the server', async () => {
    await navigateToServer(page)
    modbuxServerPort = Number(
      await page.getByTestId('server-port-input').locator('input').inputValue()
    )
    expect(modbuxServerPort).toBeGreaterThan(0)

    master = net.connect(modbuxServerPort, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      master.once('connect', resolve)
      master.once('error', reject)
    })
    master.on('close', () => masterEvents.push('closed'))
  })

  test('the client polls the device', async () => {
    await navigateToClient(page)
    await connectClient(page, '127.0.0.1', String(devicePort), '1')
    await page.getByTestId('poll-btn').click()
    await expect.poll(() => requestsSeen, { timeout: 10000 }).toBeGreaterThan(1)
  })

  test('closing every window leaves the app running', async () => {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().forEach((w) => w.close())
    )
    await expect.poll(windowCount, { timeout: 10000 }).toBe(0)
  })

  test('the client keeps polling with no window open', async () => {
    const before = requestsSeen
    await expect.poll(() => requestsSeen, { timeout: 10000 }).toBeGreaterThan(before)
  })

  test('the server keeps the master it had', async () => {
    expect(masterEvents).toEqual([])
    expect(master.readyState).toBe('open')
  })

  /**
   * Launching Modbux a second time is what reaches `second-instance`, and a
   * dock click does not: that fires `activate`, which builds a window of its
   * own. The second app loses the single instance lock and quits, which is why
   * playwright never gets to attach to it.
   */
  test('launching modbux again brings the window back', async () => {
    await electron
      .launch({ ...launchOptions(profile), timeout: 15000 })
      .then((second) => second.close())
      .catch(() => undefined)

    page = await waitForWindow()
  })

  test('the client is still polling once the window is back', async () => {
    const before = requestsSeen
    await expect.poll(() => requestsSeen, { timeout: 10000 }).toBeGreaterThan(before)
  })

  /**
   * The window that came back has to be told, because main pushes `client_state`
   * on a change and the last change was before this window existed. Without the
   * question in `init` the button reads Connect while the polling above is
   * running, and pressing it answers `Already connected`.
   */
  test('the window that came back knows the client is connected', async () => {
    await navigateToClient(page)
    await expect(page.getByTestId('connect-btn')).toContainText('Disconnect', { timeout: 5000 })
  })

  test('the master survived it too', async () => {
    expect(masterEvents).toEqual([])
    expect(master.readyState).toBe('open')
  })
})
