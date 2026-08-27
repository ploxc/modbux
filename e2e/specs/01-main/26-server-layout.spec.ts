import { test, expect } from '../../fixtures/electron-app'
import { navigateToServer, addBool } from '../../fixtures/helpers'

/**
 * The server view lays its four panels out in a wrapping flex row. Nothing
 * bounds their height, so a panel grows with its contents and the overflow it
 * carries lands on the container instead of on the list inside the panel.
 *
 * It only shows once there is enough in a panel to outgrow the space, which is
 * why filling the bit lists comes first. The window is a fixed size and a
 * smaller screen clamps it, so how visible this is depends on the machine.
 */
const DEFAULT_SIZE: [number, number] = [1480, 1000]
const BITS = 14

test.describe.serial('Server layout — panels stay inside the view', () => {
  test('fill both bit lists', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    for (let i = 0; i < BITS; i++) {
      await addBool(mainPage, 'coils', i, true)
      await addBool(mainPage, 'discrete_inputs', i, true)
    }
    await expect(mainPage.getByTestId(`server-bool-row-coils-${BITS - 1}`)).toBeVisible()
  })

  for (const [width, height] of [
    [1200, 900],
    [1024, 768],
    [820, 800]
  ] as [number, number][]) {
    test(`no overflow at ${width}x${height}`, async ({ mainPage, electronApp }) => {
      await electronApp.evaluate(({ BrowserWindow }, size) => {
        BrowserWindow.getAllWindows()[0].setSize(size[0], size[1])
      }, [width, height])
      await mainPage.waitForTimeout(500)

      const overflow = await mainPage
        .getByTestId('server-grid')
        .evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight)

      expect(overflow).toBeLessThanOrEqual(1)
    })
  }

  test('restore the window', async ({ electronApp }) => {
    await electronApp.evaluate(({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0].setSize(size[0], size[1])
    }, DEFAULT_SIZE)
  })
})
