import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Runs the same specs against the electron-builder output in dist/ instead of
// the electron-vite output in out/. Set here rather than on the command line so
// it works the same in PowerShell, cmd and POSIX shells; Playwright forks its
// workers after the config is loaded, so they inherit this.
process.env.E2E_TARGET = 'packaged'

export default defineConfig({
  ...base,
  // Launching a packaged binary is slower to start than `electron out/main`,
  // and on Windows the first run also pays for SmartScreen/AV inspection.
  timeout: 90000
})
