import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { launchOptions } from './launch'
import { createWriteStream, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * Everything the app writes, kept next to the traces.
 *
 * Playwright owns the child process and nothing reads its stdio, so a run that
 * ends with "Target page, context or browser has been closed" says only that
 * the app is gone. The exit line below is the point of this: a code means the
 * app came down on its own, a signal means something else took it.
 *
 * The workflow uploads test-results/ when a run fails, so the file travels with
 * the trace it belongs to.
 */
function keepOutput(app: ElectronApplication): void {
  const dir = join(process.cwd(), 'test-results')
  mkdirSync(dir, { recursive: true })

  const worker = process.env.TEST_WORKER_INDEX ?? '0'
  const log = createWriteStream(join(dir, `electron-main-${worker}.log`), { flags: 'a' })
  const stamp = (): string => new Date().toISOString()

  const proc = app.process()
  proc.stdout?.on('data', (c: Buffer) => log.write(`[${stamp()}] out ${c.toString()}`))
  proc.stderr?.on('data', (c: Buffer) => log.write(`[${stamp()}] err ${c.toString()}`))
  proc.on('exit', (code, signal) => {
    log.write(`[${stamp()}] exit code=${code} signal=${signal}\n`)
  })
}

export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainPage: Page
}

// eslint-disable-next-line @typescript-eslint/ban-types
export const test = base.extend<{}, ElectronFixtures>({
  electronApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use): Promise<void> => {
      const app = await electron.launch(launchOptions())
      keepOutput(app)

      await app.evaluate((ctx) =>
        ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
      )

      await use(app)
      await app.close()
    },
    { scope: 'worker' }
  ],

  mainPage: [
    async ({ electronApp }, use): Promise<void> => {
      let page: Page | undefined
      let searchCount = 0

      while (searchCount < 10) {
        searchCount++

        // Check BrowserWindow title (HTML <title> was removed to not override it)
        const found = await electronApp.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Modbux')
        )

        if (found && electronApp.windows().length === 1) {
          page = electronApp.windows()[0]
          break
        }

        await new Promise((r) => setTimeout(r, 1000))
      }

      if (!page) throw new Error('Modbux main window not found!')

      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      // Disable CSS animations/transitions globally for faster test execution
      await page.addStyleTag({
        content:
          '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }'
      })

      await use(page)
    },
    { scope: 'worker' }
  ]
})

export { expect } from '@playwright/test'
