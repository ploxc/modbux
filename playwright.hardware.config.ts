import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The way back into the specs playwright.config.ts leaves out. Requires an
// Arduino running tools/arduino/iem3000.ino on a serial port, and a person to
// select the COM port when the run pauses for it.
export default defineConfig({
  ...base,
  testDir: './e2e/specs/99-hardware',
  testIgnore: []
})
