/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import { navigateToClient } from '../../fixtures/helpers'

// TODO: Client toolbar and display options tests
// These tests cover toolbar buttons and display settings in the client view.
//
// Test IDs to cover:
// - raw-btn                → Toggle raw register values display (hex/decimal)
// - show-log-btn           → Toggle transaction log visibility
// - time-settings-btn      → Open time format settings (for UNIX/DATETIME display)
// - load-dummy-data-btn    → Load dummy/sample data into the register grid
// - reg-base-0-btn         → Set register address base to 0 (default Modbus)
// - reg-base-1-btn         → Set register address base to 1 (PLC convention)
// - read-local-time-checkbox → Toggle reading local time for UNIX/DATETIME registers
// - reg-read-config-btn    → Open register read configuration dialog
//
// Tests to implement:
// 1. Raw button toggles between decoded values and raw hex/uint16 display
// 2. Show log button reveals/hides the transaction log panel
// 3. Transaction log shows Modbus request/response frames
// 4. Time settings opens a dialog/popover for configuring time display format
// 5. Load dummy data populates the grid with sample registers
// 6. Address base 0 vs 1: register addresses shift by 1
// 7. Read local time checkbox affects UNIX/DATETIME register interpretation
// 8. Register read config button opens configuration for read operations

test.describe.serial('Client toolbar — display options and utilities', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  // ─── Raw display toggle ─────────────────────────────────────────────

  test.skip('raw button toggles raw register display', async ({ mainPage }) => {
    // TODO: Connect to server, read registers, toggle raw-btn
    // Verify: values switch between decoded (e.g., "100") and raw (hex/uint16)
  })

  // ─── Transaction log ────────────────────────────────────────────────

  test.skip('show log button reveals transaction log panel', async ({ mainPage }) => {
    // TODO: Click show-log-btn, verify log panel becomes visible
  })

  test.skip('transaction log shows Modbus frames after read', async ({ mainPage }) => {
    // TODO: Perform a read, verify log shows request/response entries
  })

  // ─── Time settings ──────────────────────────────────────────────────

  test.skip('time settings button opens time format configuration', async ({ mainPage }) => {
    // TODO: Click time-settings-btn, verify dialog/popover appears
  })

  // ─── Dummy data ─────────────────────────────────────────────────────

  test.skip('load dummy data populates register grid', async ({ mainPage }) => {
    // TODO: Click load-dummy-data-btn, verify grid has sample data
  })

  // ─── Address base ───────────────────────────────────────────────────

  test.skip('address base 0 shows addresses starting from 0', async ({ mainPage }) => {
    // TODO: Click reg-base-0-btn, verify address column starts at 0
  })

  test.skip('address base 1 shifts addresses by 1', async ({ mainPage }) => {
    // TODO: Click reg-base-1-btn, verify address column starts at 1
  })

  // ─── Read local time ────────────────────────────────────────────────

  test.skip('read local time checkbox toggles time interpretation', async ({ mainPage }) => {
    // TODO: Open menu, toggle read-local-time-checkbox
    // Verify: UNIX/DATETIME values change between UTC and local time
  })

  // ─── Register read config ──────────────────────────────────────────

  test.skip('register read config button opens read configuration', async ({ mainPage }) => {
    // TODO: Click reg-read-config-btn, verify dialog opens
    // This configures how registers are read (batch size, timeout, etc.)
  })
})
