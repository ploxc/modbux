import { describe, it, expect } from 'vitest'
import { assertOpenable, unreadablePorts } from '../require-openable-ports'

describe('assertOpenable', () => {
  it('throws when an adapter is plugged in that will not open', () => {
    expect(() => assertOpenable(['ttyACM0'])).toThrow(/will not open/)
  })

  it('leads with the fix that works during a run', () => {
    let message = ''
    try {
      assertOpenable(['ttyACM0'])
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('/dev/ttyACM0')
    expect(message).toContain('Unplug the adapter')
    // Joining the group needs a logout, which ends the run, so it comes second.
    expect(message.indexOf('Unplug the adapter')).toBeLessThan(message.indexOf('gpasswd'))
  })

  it('reads as one device or several', () => {
    expect(() => assertOpenable(['ttyACM0'])).toThrow(/exists but is refused/)
    expect(() => assertOpenable(['ttyACM0', 'ttyUSB0'])).toThrow(/exist but are refused/)
  })

  it('passes when nothing is plugged in', () => {
    expect(() => assertOpenable([])).not.toThrow()
  })
})

describe('unreadablePorts', () => {
  it('reports nothing for a directory that is not there', () => {
    expect(unreadablePorts('/no/such/dev')).toEqual([])
  })

  it('ignores everything that is not a serial device', () => {
    // /etc holds no ttyUSB or ttyACM, and is readable, so nothing comes back.
    expect(unreadablePorts('/etc')).toEqual([])
  })
})
