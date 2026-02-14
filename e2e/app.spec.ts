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

// // ─── Basic app launch ────────────────────────────────────────────────

// test('app launches and shows the home screen', async () => {
//   const title = await page.title()
//   expect(title).toBe('Modbux')
// })

// test('home screen has Client and Server options', async () => {
//   const bodyText = await page.textContent('body')
//   expect(bodyText).toContain('Client')
//   expect(bodyText).toContain('Server')
// })
