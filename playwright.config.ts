import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30000,
  retries: 0,
  workers: 1,
  maxFailures: 1,
  use: {
    trace: 'on-first-retry'
  }
})
