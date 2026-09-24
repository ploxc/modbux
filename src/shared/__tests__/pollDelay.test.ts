import { describe, expect, it } from 'vitest'
import { defaultRegisterConfig, pollDelay } from '@shared'

describe('pollDelay', () => {
  const config = { ...defaultRegisterConfig, pollRate: 5000, maxPollInterval: 1000 }

  // An offline device is polled less often, never more.
  it('waits no less than the poll rate when the most allowed is shorter', () => {
    expect(pollDelay(config, config.offlineAfterTimeouts)).toBe(5000)
    expect(pollDelay(config, config.offlineAfterTimeouts + 10)).toBe(5000)
  })

  it('waits the poll rate while the device is not offline', () => {
    expect(pollDelay(defaultRegisterConfig, defaultRegisterConfig.offlineAfterTimeouts - 1)).toBe(
      defaultRegisterConfig.pollRate
    )
  })
})
