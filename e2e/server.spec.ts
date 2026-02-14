// import {
//   test,
//   expect,
//   _electron as electron,
//   type ElectronApplication,
//   type Page
// } from '@playwright/test'
// import { resolve } from 'path'

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

// // ─── Server flow ─────────────────────────────────────────────────────

// test('can navigate to Server view', async () => {
//   await page.getByText('Server').first().click()
//   await page.waitForTimeout(500)

//   const bodyText = await page.textContent('body')
//   expect(bodyText).toContain('Coils')
//   expect(bodyText).toContain('Holding Registers')
// })

// test('can set server name', async () => {
//   const nameField = page.getByPlaceholder('Server Name')
//   await nameField.fill('Test Server')
//   await expect(nameField).toHaveValue('Test Server')
// })

// test('can configure port', async () => {
//   const portField = page.getByLabel(/^Port/)
//   await portField.fill('5020')
//   await expect(portField).toHaveValue('5020')
// })

// test('can add a coil', async () => {
//   // The title row for coils is: [DeleteButton] [Coils (0)] [AddButton]
//   // Both buttons are icon-only (no text). The add button is the last IconButton in the row.
//   const coilsTitle = page.getByText('Coils (0)')
//   await expect(coilsTitle).toBeVisible()

//   // The add/edit button is the sibling after the title text
//   // Structure: parent Box > [delete box] [title box] [add box] [AddEdit]
//   // Click the last IconButton in the sticky title bar
//   const titleBar = coilsTitle.locator('..')
//   const buttons = titleBar.getByRole('button')
//   await buttons.last().click()
//   await page.waitForTimeout(300)

//   // Popover should appear with an Address field and Add/Remove buttons
//   await expect(page.getByRole('button', { name: 'Add' })).toBeVisible()

//   // Fill address and add
//   const addressField = page.getByRole('textbox', { name: 'Address' })
//   await addressField.fill('0')
//   await page.getByRole('button', { name: 'Add' }).click()
//   await page.waitForTimeout(300)

//   // Close popover by pressing Escape
//   await page.keyboard.press('Escape')
//   await page.waitForTimeout(200)

//   // Verify coil count updated
//   await expect(page.getByText('Coils (8)')).toBeVisible()
// })

// test('can add a holding register', async () => {
//   const holdingTitle = page.getByText('Holding Registers (0)')
//   await expect(holdingTitle).toBeVisible()

//   // Click the add button (last button in the title bar)
//   const titleBar = holdingTitle.locator('..')
//   await titleBar.getByRole('button').last().click()
//   await page.waitForTimeout(300)

//   // Fill in register details in the modal
//   const addressField = page.getByRole('textbox', { name: 'Address' })
//   await addressField.fill('0')

//   const valueField = page.getByLabel('Value')
//   await valueField.fill('42')

//   // Submit
//   await page.getByRole('button', { name: 'Add Register' }).click()
//   await page.waitForTimeout(300)

//   // Verify register was added
//   await expect(page.getByText('Holding Registers (1)')).toBeVisible()
// })

// test('can start the server', async () => {
//   const startButton = page.getByRole('button', { name: /start|connect/i })
//   await startButton.click()
//   await page.waitForTimeout(1000)

//   const stopButton = page.getByRole('button', { name: /stop|disconnect/i })
//   await expect(stopButton).toBeVisible()
// })

// test('can stop the server', async () => {
//   const stopButton = page.getByRole('button', { name: /stop|disconnect/i })
//   await stopButton.click()
//   await page.waitForTimeout(500)

//   const startButton = page.getByRole('button', { name: /start|connect/i })
//   await expect(startButton).toBeVisible()
// })

// test('can navigate back to home', async () => {
//   await page.locator('button').first().click()
//   await page.waitForTimeout(500)

//   const bodyText = await page.textContent('body')
//   expect(bodyText).toContain('Client')
//   expect(bodyText).toContain('Server')
// })
