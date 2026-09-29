import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { test, expect, resetApp } from '../../fixtures/electron-app'
import { navigateToClient, selectProtocol } from '../../fixtures/helpers'
import { evaluateMain } from '../../fixtures/launch'
import { BREAKPOINTS } from '../../../src/renderer/src/components/client/ClientGrids/breakpoints'

const DEFAULT_SIZE: [number, number] = [1480, 1000]

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

/** The width the top bar's container queries ask about: its content box. */
const barWidth = (page: Page): Promise<number> =>
  page.getByTestId('client-top-bar').evaluate((el: HTMLElement) => {
    const style = getComputedStyle(el)
    return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  })

const setWindowWidth = (app: ElectronApplication, width: number): Promise<void> =>
  evaluateMain(() =>
    app.evaluate(
      ({ BrowserWindow }, [w, h]) => {
        const [window] = BrowserWindow.getAllWindows()
        if (!window) throw new Error('no window to resize')
        window.setContentSize(w, h)
      },
      [width, DEFAULT_SIZE[1]] as [number, number]
    )
  )

/**
 * Resizes the window until the top bar is `width` px wide. What lies between
 * the window's edge and the bar is measured rather than assumed.
 */
const setBarWidth = async (app: ElectronApplication, page: Page, width: number): Promise<void> => {
  const windowWidth = await page.evaluate(() => window.innerWidth)
  await setWindowWidth(app, windowWidth + width - (await barWidth(page)))
  await expect.poll(() => barWidth(page)).toBe(width)
}

/** One fold step: what shows above its breakpoint and goes at it, and what takes its place. */
interface Fold {
  name: string
  width: number
  inline: (page: Page) => Locator
  folded?: (page: Page) => Locator
}

const FOLDS: Fold[] = [
  {
    name: 'Settings, Load, Save and Clear fold into a ⋮',
    width: BREAKPOINTS.topBarWorkspace,
    inline: (page) => page.getByTestId('client-settings-btn'),
    folded: (page) => page.getByTestId('workspace-menu-btn')
  },
  {
    name: 'Poll rate and Timeout fold behind a timer button',
    width: BREAKPOINTS.topBarTiming,
    inline: (page) => page.getByTestId('poll-rate-select'),
    folded: (page) => page.getByTestId('read-timing-btn')
  },
  {
    name: 'Protocol shows its badge and not its name',
    width: BREAKPOINTS.topBarProtocol,
    inline: (page) => page.getByTestId('protocol-select').getByText('Modbus RTU')
  },
  {
    name: 'the serial field folds to a button',
    width: BREAKPOINTS.topBarSerial,
    inline: (page) => page.getByTestId('rtu-serial-field'),
    folded: (page) => page.getByTestId('rtu-serial-btn')
  }
]

// RTU, because its bar is the one the steps are measured for and the only
// one with the serial field.
test.describe.serial('The client top bar folds as it narrows', () => {
  test('the client view over RTU', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await selectProtocol(mainPage, 'ModbusRtu')
  })

  for (const fold of FOLDS) {
    test(`${fold.name} at ${fold.width} px, and not a pixel wider`, async ({
      mainPage,
      electronApp
    }) => {
      await setBarWidth(electronApp, mainPage, fold.width + 1)
      await expect(fold.inline(mainPage)).toBeVisible()
      if (fold.folded) await expect(fold.folded(mainPage)).toBeHidden()

      await setBarWidth(electronApp, mainPage, fold.width)
      await expect(fold.inline(mainPage)).toBeHidden()
      if (fold.folded) await expect(fold.folded(mainPage)).toBeVisible()
    })
  }

  test('restore the window', async ({ electronApp }) => {
    await evaluateMain(() =>
      electronApp.evaluate(({ BrowserWindow }, [w, h]) => {
        const [window] = BrowserWindow.getAllWindows()
        if (!window) throw new Error('no window to restore')
        window.setSize(w, h)
      }, DEFAULT_SIZE)
    )
  })
})
