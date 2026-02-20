import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 60000,
  retries: 0,
  workers: 1,
  maxFailures: 1,
  use: {
    trace: 'on-first-retry'
  }
})
