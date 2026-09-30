import { describe, expect, it } from 'vitest'
import { defaultConnectionSettings, pollDelay } from '@shared'

describe('pollDelay', () => {
  const settings = { ...defaultConnectionSettings, maxPollInterval: 1000 }

  // An offline device is polled less often, never more.
  it('waits no less than the poll rate when the most allowed is shorter', () => {
    expect(pollDelay(5000, settings, settings.offlineAfterTimeouts)).toBe(5000)
    expect(pollDelay(5000, settings, settings.offlineAfterTimeouts + 10)).toBe(5000)
  })

  it('waits the poll rate while the device is not offline', () => {
    expect(
      pollDelay(1000, defaultConnectionSettings, defaultConnectionSettings.offlineAfterTimeouts - 1)
    ).toBe(1000)
  })
})
