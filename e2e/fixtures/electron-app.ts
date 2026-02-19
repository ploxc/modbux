import {
  test as base,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'

export type ElectronFixtures = {
  electronApp: ElectronApplication
  mainPage: Page
}

// eslint-disable-next-line @typescript-eslint/ban-types
export const test = base.extend<{}, ElectronFixtures>({
  electronApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use): Promise<void> => {
      const app = await electron.launch({
        args: [resolve(__dirname, '../../out/main/index.js')]
      })

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

      await use(page)
    },
    { scope: 'worker' }
  ]
})

export { expect } from '@playwright/test'
