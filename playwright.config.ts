import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  // The hardware specs need an Arduino on a serial port and a human to pick the
  // COM port at a page.pause(), so an unattended run sits there forever. They
  // are conditional by nature and stay out of the always-on pipeline; run them
  // with `yarn test:e2e:hardware`.
  testIgnore: '**/99-hardware/**',
  timeout: 60000,
  retries: 0,
  workers: 1,
  maxFailures: 1,
  use: {
    trace: 'on-first-retry'
  }
})
