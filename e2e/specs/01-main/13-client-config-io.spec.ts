/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import { navigateToClient } from '../../fixtures/helpers'

// TODO: Client configuration file I/O tests
// These tests cover the client-side config management features
// that are currently untested.
//
// Test IDs to cover:
// - view-config-btn        → Opens a dialog/modal showing current register mapping config
// - save-config-btn        → Saves the current client register mapping to a JSON file
// - clear-config-btn       → Clears all configured register mappings
// - client-config-name-input → Text input for naming the client configuration
// - load-config-file-input → Already partially tested in 05-file-io.spec.ts (basic load only)
//
// Spec 05 covers basic client config loading. This spec should test:
// 1. Full client config lifecycle (create mapping → save → clear → reload → verify)
// 2. View config button shows correct JSON representation
// 3. Save config downloads a valid JSON file with correct structure
// 4. Clear config resets all register mappings
// 5. Config name input is included in saved file
// 6. Loading config with various register types (all data types, scaling factors)
// 7. Edge cases: empty config save, overwrite existing config

test.describe.serial('Client config I/O — view, save, clear, load', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  // TODO: Add register mapping via UI first, then test save/load cycle

  test.skip('view config button shows current register mapping', async ({ mainPage }) => {
    // TODO: Click view-config-btn, verify dialog/modal shows JSON config
  })

  test.skip('client config name input updates config name', async ({ mainPage }) => {
    // TODO: Type a name in client-config-name-input, verify it persists
  })

  test.skip('save client config — verify download content', async ({ mainPage, electronApp }) => {
    // TODO: Similar to server save in 05-file-io.spec.ts
    // Use will-download + setSavePath to capture and verify JSON
    // Verify: version, name, registerMapping structure
  })

  test.skip('clear client config — verify all mappings removed', async ({ mainPage }) => {
    // TODO: Click clear-config-btn, verify DataGrid is empty / no configured registers
  })

  test.skip('reload saved config — verify round-trip', async ({ mainPage }) => {
    // TODO: Load the previously saved config, verify all mappings restored
  })

  test.skip('load config with scaling factors — verify scaling applied', async ({ mainPage }) => {
    // TODO: Load client-basic.json which has scalingFactor: 0.1 on register 1
    // Verify the scaling factor is visible in config view
  })
})
