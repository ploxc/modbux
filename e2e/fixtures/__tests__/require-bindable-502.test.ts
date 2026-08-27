import { describe, it, expect } from 'vitest'
import { assertBindable, readFloor, MODBUS_PORT } from '../require-bindable-502'

describe('require-bindable-502', () => {
  describe('assertBindable', () => {
    it('throws when the floor puts 502 out of reach', () => {
      expect(() => assertBindable(1024)).toThrow(/not bindable/)
    })

    it('names the offending value and the command that fixes it', () => {
      let message = ''
      try {
        assertBindable(1024)
      } catch (error) {
        message = (error as Error).message
      }

      expect(message).toContain('is 1024')
      expect(message).toContain(`sysctl net.ipv4.ip_unprivileged_port_start=${MODBUS_PORT}`)
      expect(message).toContain('/etc/sysctl.d/50-unprivileged-ports.conf')
    })

    it('passes when the floor is exactly 502', () => {
      expect(() => assertBindable(MODBUS_PORT)).not.toThrow()
    })

    it('passes when the floor is below 502', () => {
      expect(() => assertBindable(0)).not.toThrow()
    })

    // An unreadable or nonsensical file means an unusual kernel, not a blocked
    // port. Blocking the run on that would be worse than letting it speak.
    it('passes when the floor is unknown', () => {
      expect(() => assertBindable(undefined)).not.toThrow()
    })

    it('passes when the file held something that is not a number', () => {
      expect(() => assertBindable(NaN)).not.toThrow()
    })
  })

  describe('readFloor', () => {
    it('returns undefined for a path that does not exist', () => {
      expect(readFloor('/proc/sys/net/ipv4/definitely-not-here')).toBeUndefined()
    })
  })
})
