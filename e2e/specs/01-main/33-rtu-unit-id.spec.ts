import type { Locator, Page } from '@playwright/test'
import { test, expect, resetApp } from '../../fixtures/electron-app'
import { navigateToClient } from '../../fixtures/helpers'

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

// Switching to RTU keeps the unit id TCP allowed; the field turns red rather
// than the id being rewritten, and main refuses to send it.
test.describe.serial('A unit id above 247 over RTU', () => {
  const unitIdField = (p: Page): Locator => p.getByTestId('client-unitid-input')

  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('250 over Modbus TCP is not red', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await unitIdField(mainPage).locator('input').fill('250')
    await expect(unitIdField(mainPage).locator('input')).toHaveValue('250')
    await expect(unitIdField(mainPage).locator('input')).toHaveAttribute('aria-invalid', 'false')
  })

  test('switching to RTU keeps 250 and turns it red', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-rtu-btn').click()
    await expect(unitIdField(mainPage).locator('input')).toHaveValue('250')
    await expect(unitIdField(mainPage).locator('input')).toHaveAttribute('aria-invalid', 'true')
  })

  test('247 over RTU is not red', async ({ mainPage }) => {
    await unitIdField(mainPage).locator('input').fill('247')
    await expect(unitIdField(mainPage).locator('input')).toHaveAttribute('aria-invalid', 'false')
  })

  test('back to Modbus TCP on unit id 1', async ({ mainPage }) => {
    await unitIdField(mainPage).locator('input').fill('1')
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await expect(unitIdField(mainPage).locator('input')).toHaveValue('1')
  })
})
