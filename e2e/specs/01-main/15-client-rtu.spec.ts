/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import { navigateToClient } from '../../fixtures/helpers'

// TODO: Client RTU/Serial connection tests
// These tests cover the Modbus RTU (serial) protocol configuration.
//
// Test IDs to cover:
// - protocol-tcp-btn       → Toggle to TCP mode (default)
// - protocol-rtu-btn       → Toggle to RTU/serial mode
// - rtu-com-input          → COM port / serial device path input
// - rtu-refresh-btn        → Refresh available serial ports list
// - rtu-validate-btn       → Validate the selected COM port
// - rtu-baudrate-select    → Baudrate selection (9600, 19200, 38400, 57600, 115200, etc.)
// - rtu-parity-select      → Parity selection (none, even, odd)
// - rtu-databits-select    → Data bits selection (7, 8)
// - rtu-stopbits-select    → Stop bits selection (1, 2)
//
// NOTE: RTU tests are limited without a physical/virtual serial port.
// These tests focus on UI behavior and configuration state, not actual
// serial communication. Consider using virtual serial port pairs for
// full integration testing.
//
// Tests to implement:
// 1. Protocol toggle switches between TCP and RTU config panels
// 2. RTU panel shows all serial config fields (COM, baudrate, parity, etc.)
// 3. Default RTU values (9600 baud, no parity, 8 data bits, 1 stop bit)
// 4. Baudrate dropdown has expected options
// 5. Parity dropdown has expected options (none, even, odd)
// 6. Data bits dropdown has expected options (7, 8)
// 7. Stop bits dropdown has expected options (1, 2)
// 8. Refresh button triggers port discovery (may be empty in CI)
// 9. Validate button checks if COM port exists
// 10. Switching back to TCP preserves TCP connection settings
// 11. RTU config persists when switching between views

test.describe.serial('Client RTU — serial protocol configuration', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  // ─── Protocol toggle ────────────────────────────────────────────────

  test.skip('switch to RTU protocol shows serial config', async ({ mainPage }) => {
    // TODO: Click protocol-rtu-btn, verify RTU config fields appear
    // Verify: TCP fields (host, port) are hidden, RTU fields visible
  })

  test.skip('default RTU values are correct', async ({ mainPage }) => {
    // TODO: Verify defaults: 9600 baud, no parity, 8 data bits, 1 stop bit
  })

  // ─── Serial config fields ──────────────────────────────────────────

  test.skip('baudrate select has expected options', async ({ mainPage }) => {
    // TODO: Open rtu-baudrate-select, verify options
    // Expected: 9600, 19200, 38400, 57600, 115200 (at minimum)
  })

  test.skip('parity select has expected options', async ({ mainPage }) => {
    // TODO: Open rtu-parity-select, verify: none, even, odd
  })

  test.skip('data bits select has expected options', async ({ mainPage }) => {
    // TODO: Open rtu-databits-select, verify: 7, 8
  })

  test.skip('stop bits select has expected options', async ({ mainPage }) => {
    // TODO: Open rtu-stopbits-select, verify: 1, 2
  })

  // ─── COM port ───────────────────────────────────────────────────────

  test.skip('COM port input accepts serial device path', async ({ mainPage }) => {
    // TODO: Type a COM port path (e.g., /dev/ttyUSB0 or COM3)
  })

  test.skip('refresh button triggers port discovery', async ({ mainPage }) => {
    // TODO: Click rtu-refresh-btn, verify it triggers (even if no ports found)
  })

  test.skip('validate button checks COM port existence', async ({ mainPage }) => {
    // TODO: Click rtu-validate-btn with invalid port, verify error feedback
  })

  // ─── Protocol switching ─────────────────────────────────────────────

  test.skip('switch back to TCP preserves TCP settings', async ({ mainPage }) => {
    // TODO: Configure TCP (host/port), switch to RTU, switch back
    // Verify: TCP host and port values are preserved
  })
})
