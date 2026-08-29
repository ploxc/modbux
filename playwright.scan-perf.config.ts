import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// How much a mounted register grid costs during a scan. Answering that takes a
// scan of 2000 addresses one at a time, which is minutes rather than seconds,
// so it stays out of the suite and is run on purpose.
//
// Set SCAN_LENGTH and CHUNK_SIZE to change the shape of the scan.
export default defineConfig({
  ...base,
  testDir: './e2e/specs/97-scan-perf',
  testIgnore: [],
  timeout: 600000
})
