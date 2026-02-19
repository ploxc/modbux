import { test, expect } from '../../fixtures/electron-app'

test.describe.serial('Home screen and navigation', () => {
  test('app launches with correct title', async ({ electronApp }) => {
    const title = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'Modbux')
        ?.getTitle()
    )
    expect(title).toBe('Modbux')
  })

  test('shows Client, Server, and Split buttons', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('home-client-btn')).toBeVisible()
    await expect(mainPage.getByTestId('home-server-btn')).toBeVisible()
    await expect(mainPage.getByTestId('home-split-btn')).toBeVisible()
  })

  test('shows version and ploxc links', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('home-version-link')).toBeVisible()
    await expect(mainPage.getByTestId('home-ploxc-link')).toBeVisible()
  })

  test('navigate to Server view and back', async ({ mainPage }) => {
    await mainPage.getByTestId('home-server-btn').click()
    await mainPage.waitForTimeout(600)

    await expect(mainPage.getByTestId('section-coils')).toBeVisible()

    await mainPage.getByTestId('home-btn').click()
    await mainPage.waitForTimeout(600)

    await expect(mainPage.getByTestId('home-server-btn')).toBeVisible()
  })

  test('navigate to Client view and back', async ({ mainPage }) => {
    await mainPage.getByTestId('home-client-btn').click()
    await mainPage.waitForTimeout(600)

    await expect(mainPage.getByTestId('connect-btn')).toBeVisible()

    await mainPage.getByTestId('home-btn').click()
    await mainPage.waitForTimeout(600)

    await expect(mainPage.getByTestId('home-client-btn')).toBeVisible()
  })
})
