import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { launchElectron, evaluateMain } from './launch'

export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainPage: Page
}

/**
 * A trace of the app for every test that fails.
 *
 * Playwright's own `trace` option records the contexts it creates itself, and
 * the app's is not one of them, so a failed test's trace held its assertions
 * and no DOM. Tracing runs on the app's context for the whole worker, one
 * chunk per test, and a chunk is written only when its test failed, beside a
 * screenshot of every window still open. An app that is already gone has no
 * chunk to stop, and its log says why.
 */
type ElectronTestFixtures = { electronTrace: void }

export const test = base.extend<ElectronTestFixtures, ElectronFixtures>({
  electronTrace: [
    async ({ electronApp }, use, testInfo): Promise<void> => {
      const tracing = electronApp.context().tracing
      await tracing.startChunk({ title: testInfo.title })
      await use()
      if (testInfo.status === testInfo.expectedStatus) {
        await tracing.stopChunk().catch(() => undefined)
        return
      }
      for (const [i, window] of electronApp.windows().entries()) {
        await window
          .screenshot({ path: testInfo.outputPath(`window-${i}.png`) })
          .catch(() => undefined)
      }
      await tracing
        .stopChunk({ path: testInfo.outputPath('electron-trace.zip') })
        .catch(() => undefined)
    },
    { auto: true }
  ],
  electronApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use): Promise<void> => {
      const app = await launchElectron()
      await app.context().tracing.start({ snapshots: true })

      await evaluateMain(() =>
        app.evaluate((ctx) =>
          ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
        )
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
        const found = await evaluateMain(() =>
          electronApp.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Modbux')
          )
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
