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
import { navigateToClient } from '../../fixtures/helpers'

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
