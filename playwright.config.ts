import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/specs',
  // Two suites stay out of the always-on pipeline.
  //
  // The hardware specs need an Arduino on a serial port and a human to pick the
  // COM port at a page.pause(), so an unattended run sits there forever. Run
  // them with `yarn test:e2e:hardware`.
  //
  // The privileged port modal needs the kernel to actually refuse port 502, and
  // only root can arrange that. The spec pauses for a sudo command in a real
  // terminal and for a PolicyKit prompt. Run it with
  // `yarn test:e2e:privileged-port`.
  //
  // The presentation tour produces the manual's screenshots. It clicks through
  // the app and captures what it sees; it barely asserts anything, so it costs
  // two minutes to tell you little that 01-main does not already check. Run it
  // when you want fresh screenshots, with `yarn presentation`.
  testIgnore: ['**/98-privileged-port/**', '**/99-hardware/**', '**/03-presentation/**'],
  // Checked once before anything launches: on Linux a raised port floor makes
  // the server fall back off 502 and the specs fail in a way that points at the
  // UI instead of at the machine.
  globalSetup: './e2e/fixtures/global-setup.ts',
  timeout: 60000,
  retries: 0,
  workers: 1,
  maxFailures: 1,
  use: {
    trace: 'on-first-retry'
  }
})
