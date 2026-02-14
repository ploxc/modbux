// /**
//  * End-to-end test: Client connects to own Server
//  *
//  * This test uses the app's built-in server AND client to verify
//  * the full Modbus TCP communication flow without external dependencies.
//  *
//  * Flow:
//  * 1. Open Server view → configure registers → start server
//  * 2. Open a second window as Client → connect to localhost → read registers
//  * 3. Verify read values match server configuration
//  */

// import {
//   test,
//   expect,
//   _electron as electron,
//   type ElectronApplication,
//   type Page
// } from '@playwright/test'
// import { resolve } from 'path'

// const SERVER_PORT = '5021'

// let app: ElectronApplication
// let page: Page

// test.beforeAll(async () => {
//   app = await electron.launch({
//     args: [resolve(__dirname, '../out/main/index.js')]
//   })
//   page = await app.firstWindow()
//   await page.waitForLoadState('domcontentloaded')
// })

// test.afterAll(async () => {
//   if (app) await app.close()
// })

// // ─── Setup: Start a server with known values ────────────────────────

// test.describe.serial('Client-Server integration', () => {
//   test('setup server with holding register value 42', async () => {
//     // Navigate to Server
//     await page.getByText('Server').first().click()
//     await page.waitForTimeout(500)

//     // Set port to avoid conflicts
//     const portField = page.getByLabel(/^Port/)
//     await portField.fill(SERVER_PORT)

//     // Add a holding register at address 0 with value 42
//     const holdingSection = page.getByText('Holding Registers').first()
//     const holdingRow = holdingSection.locator('..')
//     await holdingRow
//       .getByRole('button')
//       .filter({ hasText: /add|plus|edit/i })
//       .first()
//       .click()
//     await page.waitForTimeout(300)

//     await page.getByLabel('Address').fill('0')
//     await page.getByLabel('Value').fill('42')
//     await page.getByRole('button', { name: 'Add Register' }).click()
//     await page.waitForTimeout(300)

//     // Start the server
//     await page.getByRole('button', { name: /start|connect/i }).click()
//     await page.waitForTimeout(1000)

//     // Verify server is running
//     await expect(page.getByRole('button', { name: /stop|disconnect/i })).toBeVisible()
//   })

//   test('navigate to client and connect to server', async () => {
//     // Go back to home
//     await page.locator('button').first().click()
//     await page.waitForTimeout(500)

//     // Navigate to Client
//     await page.getByText('Client').first().click()
//     await page.waitForTimeout(500)

//     // Verify TCP is selected (default)
//     await expect(page.getByText('TCP')).toBeVisible()

//     // Configure connection: localhost + our port
//     const ipField = page.getByLabel('IP Address')
//     await ipField.fill('127.0.0.1')

//     const portField = page.getByLabel('Port')
//     await portField.fill(SERVER_PORT)

//     // Connect
//     await page.getByRole('button', { name: 'Connect' }).click()
//     await page.waitForTimeout(1000)

//     // Verify connected
//     await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible()
//   })

//   test('read holding registers and verify value', async () => {
//     // Configure register read: Holding Registers, address 0, length 1
//     const typeSelect = page.getByLabel('Type')
//     await typeSelect.click()
//     await page.getByRole('option', { name: 'Holding Registers' }).click()

//     const addressField = page.getByLabel('Address')
//     await addressField.fill('0')

//     const lengthField = page.getByLabel('Length')
//     await lengthField.fill('1')

//     // Click Read
//     await page.getByRole('button', { name: 'Read' }).click()
//     await page.waitForTimeout(1000)

//     // Verify the value 42 appears in the response
//     const bodyText = await page.textContent('body')
//     expect(bodyText).toContain('42')
//   })

//   test('start polling and verify updates', async () => {
//     // Start polling
//     await page.getByRole('button', { name: 'Poll' }).click()
//     await page.waitForTimeout(2000)

//     // Value should still be visible during polling
//     const bodyText = await page.textContent('body')
//     expect(bodyText).toContain('42')

//     // Stop polling
//     await page.getByRole('button', { name: 'Poll' }).click()
//     await page.waitForTimeout(500)
//   })

//   test('disconnect client', async () => {
//     await page.getByRole('button', { name: 'Disconnect' }).click()
//     await page.waitForTimeout(500)

//     await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()
//   })
// })
