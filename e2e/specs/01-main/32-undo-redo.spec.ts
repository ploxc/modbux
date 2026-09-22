/**
 * Undo and redo
 *
 * A focused text field keeps Cmd+Z and Cmd+Shift+Z: the field's own history
 * runs, and what it puts back goes through the setter like a keystroke, so the
 * saved configuration follows. The key presses here go to the page, not through
 * Electron's Edit menu, so this covers the field's half and not the menu's.
 */
import { test, expect } from '../../fixtures/electron-app'
import type { Locator, Page } from '@playwright/test'
import {
  addBool,
  cleanServerState,
  navigateToClient,
  navigateToHome,
  navigateToServer,
  selectRegisterType,
  splitOutServerWindow
} from '../../fixtures/helpers'

/** What the client store last persisted, read the way the next launch reads it. */
const savedConnection = async (p: Page): Promise<{ host: string; unitId: number }> =>
  p.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('client.zustand') ?? '{}')
    const connectionConfig = saved.state?.connectionConfig
    return {
      host: connectionConfig?.tcp?.host,
      unitId: connectionConfig?.unitId
    }
  })

/** Replaces what the field holds by typing, one key at a time. */
const typeOver = async (p: Page, input: Locator, text: string): Promise<void> => {
  await input.click()
  await p.keyboard.press('ControlOrMeta+a')
  await p.keyboard.type(text, { delay: 30 })
}

test.describe.serial('Undo and redo in a focused field', () => {
  test('open the client view over TCP', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await mainPage.getByTestId('protocol-tcp-btn').click()
  })

  test('the host field undoes and redoes what was typed, and the config follows', async ({
    mainPage
  }) => {
    const input = mainPage.getByTestId('tcp-host-input').locator('input')
    await input.fill('127.0.0.1')
    await expect.poll(async () => (await savedConnection(mainPage)).host).toBe('127.0.0.1')

    await typeOver(mainPage, input, '10.0.0.5')
    await expect.poll(async () => (await savedConnection(mainPage)).host).toBe('10.0.0.5')

    await mainPage.keyboard.press('ControlOrMeta+z')
    await expect(input).toHaveValue('127.0.0.1')
    await expect.poll(async () => (await savedConnection(mainPage)).host).toBe('127.0.0.1')

    await mainPage.keyboard.press('ControlOrMeta+Shift+z')
    await expect(input).toHaveValue('10.0.0.5')
    await expect.poll(async () => (await savedConnection(mainPage)).host).toBe('10.0.0.5')

    await input.fill('127.0.0.1')
  })

  test('the unit id field undoes and redoes what was typed, and the config follows', async ({
    mainPage
  }) => {
    const input = mainPage.getByTestId('client-unitid-input').locator('input')
    await input.fill('1')
    await expect.poll(async () => (await savedConnection(mainPage)).unitId).toBe(1)

    await typeOver(mainPage, input, '17')
    await expect.poll(async () => (await savedConnection(mainPage)).unitId).toBe(17)

    await mainPage.keyboard.press('ControlOrMeta+z')
    await expect(input).toHaveValue('1')
    await expect.poll(async () => (await savedConnection(mainPage)).unitId).toBe(1)

    await mainPage.keyboard.press('ControlOrMeta+Shift+z')
    await expect(input).toHaveValue('17')
    await expect.poll(async () => (await savedConnection(mainPage)).unitId).toBe(17)

    await input.fill('0')
  })
})

/** Takes the focus off any field, so the key goes to the stack rather than the field. */
const leaveTheField = async (p: Page): Promise<void> => {
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}

test.describe.serial('Undo and redo outside a field', () => {
  // The byte order rather than a text field: Chromium undoes typing in a field
  // it has just left on its own, so a host edit would pass with no listener.
  test('the client view undoes and redoes the byte order, and the config follows', async ({
    mainPage
  }) => {
    await navigateToClient(mainPage)
    // The byte order is shown for the word registers alone.
    await selectRegisterType(mainPage, 'Holding Registers')
    const savedLittleEndian = (): Promise<boolean> =>
      mainPage.evaluate(
        () =>
          JSON.parse(localStorage.getItem('client.zustand') ?? '{}').state?.registerConfig
            ?.littleEndian
      )
    await mainPage.getByTestId('endian-be-btn').click()
    await expect.poll(savedLittleEndian).toBe(false)
    await mainPage.getByTestId('endian-le-btn').click()
    await expect.poll(savedLittleEndian).toBe(true)
    await leaveTheField(mainPage)

    await mainPage.keyboard.press('ControlOrMeta+z')
    await expect.poll(savedLittleEndian).toBe(false)
    await expect(mainPage.getByTestId('endian-be-btn')).toHaveAttribute('aria-pressed', 'true')

    await mainPage.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(savedLittleEndian).toBe(true)

    await mainPage.getByTestId('endian-be-btn').click()
  })

  test('the server view undoes and redoes an added coil', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
    await addBool(mainPage, 'coils', 3)
    const row = mainPage.getByTestId('server-bool-row-coils-3')
    await expect(row).toBeVisible()
    await leaveTheField(mainPage)

    await mainPage.keyboard.press('ControlOrMeta+z')
    await expect(row).toHaveCount(0)

    await mainPage.keyboard.press('ControlOrMeta+Shift+z')
    await expect(row).toBeVisible()

    await cleanServerState(mainPage)
  })
})

test.describe.serial('The server steps travel with the server view', () => {
  test('a step taken in the main window is undone in the split out one, and back', async ({
    electronApp,
    mainPage
  }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
    await addBool(mainPage, 'coils', 3)
    await expect(mainPage.getByTestId('server-bool-row-coils-3')).toBeVisible()

    await navigateToHome(mainPage)
    const serverPage = await splitOutServerWindow(electronApp, mainPage)
    const splitRow = serverPage.getByTestId('server-bool-row-coils-3')
    await expect(splitRow).toBeVisible()

    await serverPage.keyboard.press('ControlOrMeta+z')
    await expect(splitRow).toHaveCount(0)

    await addBool(serverPage, 'coils', 5)
    await expect(serverPage.getByTestId('server-bool-row-coils-5')).toBeVisible()
    await leaveTheField(serverPage)

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.getTitle() === 'Server')
        ?.close()
    })
    await expect(mainPage.getByTestId('home-btn')).toBeVisible()
    await navigateToServer(mainPage)
    const mainRow = mainPage.getByTestId('server-bool-row-coils-5')
    await expect(mainRow).toBeVisible()
    await leaveTheField(mainPage)

    await mainPage.keyboard.press('ControlOrMeta+z')
    await expect(mainRow).toHaveCount(0)

    await cleanServerState(mainPage)
  })
})
