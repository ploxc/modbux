import { test as base, type ElectronApplication, type Page } from '@playwright/test'
import { launchElectron, evaluateMain } from './launch'

type RunningApp = { file: string; app: ElectronApplication; page: Page }

/**
 * The app a spec file runs against, launched for that file alone.
 *
 * One app per worker carried every spec's leftovers into the next, such as
 * the client 27 left on RTU, and 12, 15 and 18 passed in the suite and failed
 * on their own. So the app is launched when a file's first test asks for it
 * and closed when the next file's does.
 *
 * The worker holds the running app so the last one is closed at teardown.
 * `electronApp` and `mainPage` are test fixtures on top of it, which is why a
 * `beforeAll` or `afterAll` cannot take them.
 */
type ElectronWorkerFixtures = { runningApp: { current: RunningApp | undefined } }

export type ElectronFixtures = {
  appForFile: RunningApp
  electronApp: ElectronApplication
  mainPage: Page
  electronTrace: void
}

async function launchForFile(file: string): Promise<RunningApp> {
  const app = await launchElectron()
  await app.context().tracing.start({ snapshots: true })

  await evaluateMain(() =>
    app.evaluate((ctx) =>
      ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
    )
  )

  let page: Page | undefined
  let searchCount = 0

  while (searchCount < 10) {
    searchCount++

    // Check BrowserWindow title (HTML <title> was removed to not override it)
    const found = await evaluateMain(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Modbux')
      )
    )

    if (found && app.windows().length === 1) {
      page = app.windows()[0]
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

  return { file, app, page }
}

export const test = base.extend<ElectronFixtures, ElectronWorkerFixtures>({
  runningApp: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use): Promise<void> => {
      const holder: { current: RunningApp | undefined } = { current: undefined }
      await use(holder)
      await holder.current?.app.close()
    },
    { scope: 'worker' }
  ],

  appForFile: [
    async ({ runningApp }, use, testInfo): Promise<void> => {
      let running = runningApp.current
      if (running?.file !== testInfo.file) {
        await running?.app.close()
        runningApp.current = undefined
        running = await launchForFile(testInfo.file)
        runningApp.current = running
      }
      await use(running)
    },
    { scope: 'test' }
  ],

  electronApp: [
    async ({ appForFile }, use): Promise<void> => {
      await use(appForFile.app)
    },
    { scope: 'test' }
  ],

  mainPage: [
    async ({ appForFile }, use): Promise<void> => {
      await use(appForFile.page)
    },
    { scope: 'test' }
  ],

  /**
   * A trace of the app for every test that fails.
   *
   * Playwright's own `trace` option records the contexts it creates itself,
   * and the app's is not one of them, so a failed test's trace held its
   * assertions and no DOM. Tracing runs on the app's context, one chunk per
   * test, and a chunk is written only when its test failed, beside a
   * screenshot of every window still open. An app that is already gone has no
   * chunk to stop, and its log says why.
   */
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
  ]
})

export { expect } from '@playwright/test'
