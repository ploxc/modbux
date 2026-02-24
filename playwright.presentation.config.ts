import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs/03-presentation',
  timeout: 120000,
  retries: 0,
  workers: 1,
  maxFailures: 1,
  outputDir: './e2e/presentation-output/test-results'
})
