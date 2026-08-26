import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// The privileged port modal only opens when the kernel actually refuses 502,
// and only root can change that. The spec pauses for a sudo command in a real
// terminal and for a PolicyKit prompt, so an unattended run would sit there
// forever. Linux only — the feature does not exist elsewhere.
export default defineConfig({
  ...base,
  testDir: './e2e/specs/98-privileged-port',
  testIgnore: [],
  // This suite exists precisely to run with 502 blocked, so the guard that every
  // other config inherits would refuse to start it.
  globalSetup: undefined,
  // Every step here can be waiting on a person — a sudo command in another
  // terminal, a PolicyKit password prompt. A clock would just kill the run
  // while they are typing.
  timeout: 0
})
