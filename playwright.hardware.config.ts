import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The way back into the specs playwright.config.ts leaves out. Requires an
// Arduino running tools/arduino/iem3000.ino on a serial port; the port is found
// by USB vendor ID, and the suite skips itself when no board is attached.
export default defineConfig({
  ...base,
  testDir: './e2e/specs/99-hardware',
  testIgnore: []
})
