import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The way back into the presentation tour that playwright.config.ts leaves out.
// Spreads the base config so workers and retries stay in one place, and
// overrides only what this suite genuinely needs: a longer timeout for the
// deliberate pauses between scenes, its own output directory, and a stop at
// the first failure, because every scene builds on the one before it.
export default defineConfig({
  ...base,
  testDir: './e2e/specs/03-presentation',
  testIgnore: [],
  timeout: 120000,
  outputDir: './e2e/presentation-output/test-results',
  maxFailures: 1
})
