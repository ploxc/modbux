import { describe, it, expect } from 'vitest'
import { snakeToCamel } from '../types/helpers'

// ─── snakeToCamel ────────────────────────────────────────────────────

describe('snakeToCamel', () => {
  it('converts snake_case to camelCase', () => {
    expect(snakeToCamel('update_register_config')).toBe('updateRegisterConfig')
  })

  it('returns single word unchanged', () => {
    expect(snakeToCamel('connect')).toBe('connect')
  })

  it('handles multiple underscores', () => {
    expect(snakeToCamel('stop_scanning_unit_ids')).toBe('stopScanningUnitIds')
  })

  it('handles two-part names', () => {
    expect(snakeToCamel('start_polling')).toBe('startPolling')
  })

  it('converts all IPC_CHANNELS correctly', () => {
    const cases: [string, string][] = [
      ['update_register_config', 'updateRegisterConfig'],
      ['scan_unit_ids', 'scanUnitIds'],
      ['add_replace_server_register', 'addReplaceServerRegister'],
      ['set_bool', 'setBool'],
      ['get_app_version', 'getAppVersion'],
      ['list_serial_ports', 'listSerialPorts'],
      ['validate_serial_port', 'validateSerialPort']
    ]
    for (const [input, expected] of cases) {
      expect(snakeToCamel(input)).toBe(expected)
    }
  })
})
