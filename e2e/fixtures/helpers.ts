import { test, expect, type Page } from '@playwright/test'
import type { RegisterDef, ServerConfig } from './types'

/** Scale a timeout for fast mode: 300→75ms, 200→50ms, ≤100→0ms, 500→100ms */
function t(ms: number, fast: boolean): number {
  if (!fast) return ms
  if (ms <= 100) return 0
  if (ms <= 200) return 10
  if (ms <= 300) return 20
  return 50
}

/** Select a data type in the AddRegister modal's DataTypeSelectInput */
export async function selectDataType(p: Page, dataType: string, fast = false): Promise<void> {
  await p.getByTestId('add-reg-type-select').click()
  await p.waitForTimeout(t(200, fast))
  await p.getByRole('option', { name: dataType, exact: true }).click()
  await p.waitForTimeout(t(200, fast))
}

/** Select a unit ID in the ServerConfig dropdown */
export async function selectUnitId(p: Page, unitId: string, fast = false): Promise<void> {
  await p.getByTestId('server-unitid-select').click()
  await p.waitForTimeout(t(200, fast))
  await p.getByRole('option', { name: unitId, exact: true }).click()
  await p.waitForTimeout(t(200, fast))
}

/** Select a register type in the client RegisterConfig */
export async function selectRegisterType(p: Page, name: string): Promise<void> {
  await p.getByTestId('reg-type-select').click()
  await p.waitForTimeout(200)
  await p.getByRole('option', { name }).click()
  await p.waitForTimeout(200)
}

/** Read a specific cell value from the MUI DataGrid (client side) */
export async function cell(p: Page, rowId: number, field: string): Promise<string> {
  const loc = p.locator(`.MuiDataGrid-row[data-id="${rowId}"] [data-field="${field}"]`)
  return ((await loc.textContent()) ?? '').trim()
}

/**
 * Add a register with full config support.
 * Uses test.step() for named reporting per register.
 * @param modalAlreadyOpen - set to true if modal is already open (e.g. after "Add & Next")
 * @param fast             - minimal delays; use in setup-only helpers, not in spec tests
 */
export async function addRegister(
  p: Page,
  reg: RegisterDef,
  modalAlreadyOpen = false,
  fast = false
): Promise<void> {
  const label = `${reg.dataType} @ ${reg.address} (${reg.mode}${reg.comment ? `, ${reg.comment}` : ''})`

  await test.step(`add register: ${label}`, async () => {
    const modal = p.getByTestId('add-reg-address-input')

    if (!modalAlreadyOpen) {
      await p.getByTestId(`add-${reg.registerType}-btn`).click()
      await expect(modal).toBeVisible()
    }

    await selectDataType(p, reg.dataType, fast)

    const addressInput = modal.locator('input')
    await addressInput.fill(String(reg.address))

    if (reg.mode === 'fixed-utf8') {
      const lengthInput = p.getByTestId('add-reg-length-input').locator('input')
      await lengthInput.fill(String(reg.length))
      const stringInput = p.getByTestId('add-reg-string-input').locator('input')
      await stringInput.fill(reg.stringValue)
    } else if (reg.mode === 'fixed-datetime') {
      await p.getByTestId('add-reg-fixed-btn').click()
    } else if (reg.mode === 'generator-datetime') {
      await p.getByTestId('add-reg-generator-btn').click()
      const intervalInput = p.getByTestId('add-reg-interval-input').locator('input')
      await expect(intervalInput).toBeVisible()
      await intervalInput.fill(reg.interval)
    } else if (reg.mode === 'fixed') {
      await p.getByTestId('add-reg-fixed-btn').click()
      const valueInput = p.getByTestId('add-reg-value-input').locator('input')
      await expect(valueInput).toBeVisible()
      await valueInput.fill(reg.value)
    } else {
      await p.getByTestId('add-reg-generator-btn').click()
      const minInput = p.getByTestId('add-reg-min-input').locator('input')
      await expect(minInput).toBeVisible()
      await minInput.fill(reg.min)
      const maxInput = p.getByTestId('add-reg-max-input').locator('input')
      await maxInput.fill(reg.max)
      const intervalInput = p.getByTestId('add-reg-interval-input').locator('input')
      await intervalInput.fill(reg.interval)
    }

    if (reg.comment) {
      const commentInput = p.getByTestId('add-reg-comment-input').locator('input')
      await commentInput.fill(reg.comment)
    }

    if (reg.next) {
      await p.getByTestId('add-reg-next-btn').click()
      // After "Add & Next", modal stays open with cleared address
      await expect(addressInput).toBeVisible()
    } else {
      await p.getByTestId('add-reg-submit-btn').click()
      // After submit, modal closes
      await expect(modal).not.toBeVisible()
    }
  })
}

/** Add coils starting at the given address (adds a group of 8) */
export async function addCoils(p: Page, address: number, fast = false): Promise<void> {
  await test.step(`add coils @ ${address}`, async () => {
    await p.getByTestId('add-coils-btn').click()
    const modal = p.getByTestId('add-bool-address-input')
    await expect(modal).toBeVisible()

    await modal.locator('input').fill(String(address))
    await p.getByTestId('add-bool-add-btn').click()
    await p.waitForTimeout(t(200, fast))

    await p.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })
}

/** Add discrete inputs starting at the given address (adds a group of 8) */
export async function addDiscreteInputs(p: Page, address: number, fast = false): Promise<void> {
  await test.step(`add discrete inputs @ ${address}`, async () => {
    await p.getByTestId('add-discrete_inputs-btn').click()
    const modal = p.getByTestId('add-bool-address-input')
    await expect(modal).toBeVisible()

    await modal.locator('input').fill(String(address))
    await p.getByTestId('add-bool-add-btn').click()
    await p.waitForTimeout(t(200, fast))

    await p.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })
}

/** Set client address and length, then read */
export async function readRegisters(p: Page, address: string, length: string): Promise<void> {
  const addressInput = p.getByTestId('reg-address-input').locator('input')
  await addressInput.fill(address)
  const lengthInput = p.getByTestId('reg-length-input').locator('input')
  await lengthInput.fill(length)
  await p.getByTestId('read-btn').click()
  // Wait for at least one row to appear with the requested start address
  await expect(p.locator(`.MuiDataGrid-row[data-id="${address}"]`)).toBeVisible({ timeout: 5000 })
}

/** Clear the client data grid */
export async function clearData(p: Page): Promise<void> {
  await p.getByTestId('clear-data-btn').click()
  await p.waitForTimeout(300)
}

/**
 * Setup a full server config from a ServerConfig object.
 *
 * @param fast - when true: minimal delays + automatically chains same-type registers with
 *               "Add & Next" so the modal is opened only once per register type.
 *               Use for setup-only specs (06-13); keep false (default) for spec 03 which
 *               tests the actual server-config behaviour.
 */
export async function setupServerConfig(
  p: Page,
  config: ServerConfig | Omit<ServerConfig, 'port'>,
  fast = false
): Promise<void> {
  const msPerRegister = fast ? 1000 : 2000
  const total = config.registers.length + config.bools.length
  test.setTimeout(total * msPerRegister + 15_000)

  await test.step(`set server name: ${config.name}`, async () => {
    const nameField = p.getByTestId('server-name-input').locator('input')
    await nameField.fill(config.name)
  })

  await test.step(`select unit ID: ${config.unitId}`, async () => {
    await selectUnitId(p, config.unitId, fast)
  })

  if (fast) {
    // Group registers by type (preserving original order within each type).
    // This lets us open the modal once per type and chain with Add & Next.
    const byType = new Map<string, RegisterDef[]>()
    for (const reg of config.registers) {
      if (!byType.has(reg.registerType)) byType.set(reg.registerType, [])
      byType.get(reg.registerType)!.push(reg)
    }

    for (const regs of byType.values()) {
      for (let i = 0; i < regs.length; i++) {
        const isLast = i === regs.length - 1
        await addRegister(p, { ...regs[i], next: !isLast }, i > 0, fast)
      }
    }
  } else {
    let modalOpen = false
    for (const reg of config.registers) {
      await addRegister(p, reg, modalOpen)
      modalOpen = !!reg.next
    }
  }

  const coilGroups = new Set<number>()
  const diGroups = new Set<number>()
  for (const bool of config.bools) {
    const groupStart = Math.floor(bool.address / 8) * 8
    if (bool.registerType === 'coils') {
      coilGroups.add(groupStart)
    } else {
      diGroups.add(groupStart)
    }
  }

  for (const start of coilGroups) {
    await addCoils(p, start, fast)
  }
  for (const start of diGroups) {
    await addDiscreteInputs(p, start, fast)
  }

  if (config.bools.length > 0) {
    await test.step(`toggle ${config.bools.filter((b) => b.state).length} bools`, async () => {
      for (const bool of config.bools) {
        if (bool.state) {
          const btn = p.getByTestId(`server-bool-${bool.registerType}-${bool.address}`)
          await btn.click()
          await p.waitForTimeout(t(100, fast))
        }
      }
    })
  }
}

/** Connect client to server */
export async function connectClient(
  p: Page,
  host: string,
  port: string,
  unitId: string
): Promise<void> {
  const hostInput = p.getByTestId('tcp-host-input').locator('input')
  await expect(hostInput).toBeVisible({ timeout: 5000 })
  await hostInput.fill(host)
  const portInput = p.getByTestId('tcp-port-input').locator('input')
  await portInput.fill(port)
  const unitIdInput = p.getByTestId('client-unitid-input').locator('input')
  await unitIdInput.fill(unitId)
  await p.getByTestId('connect-btn').click()
  await expect(p.getByTestId('connect-btn')).toContainText('Disconnect', { timeout: 5000 })
}

/** Disconnect client */
export async function disconnectClient(p: Page): Promise<void> {
  await p.getByTestId('connect-btn').click()
  await expect(p.getByTestId('connect-btn')).toContainText('Connect', { timeout: 5000 })
}

/**
 * Switch to RTU protocol and configure serial parameters.
 * Does NOT set COM port — that must be done manually (e.g. via page.pause()).
 * After calling this, click connect-btn separately once the COM port is set.
 */
export async function connectClientRTU(
  p: Page,
  unitId: string,
  baudrate = '9600',
  parity = 'none',
  databits = '8',
  stopbits = '1'
): Promise<void> {
  await p.getByTestId('protocol-rtu-btn').click()
  await expect(p.getByTestId('rtu-baudrate-select')).toBeVisible()

  // Set baudrate
  await p.getByTestId('rtu-baudrate-select').click()
  await p.getByRole('option', { name: baudrate }).click()

  // Set parity
  await p.getByTestId('rtu-parity-select').click()
  await p.getByRole('option', { name: parity }).click()

  // Set databits
  await p.getByTestId('rtu-databits-select').click()
  await p.getByRole('option', { name: databits }).click()

  // Set stopbits
  await p.getByTestId('rtu-stopbits-select').click()
  await p.getByRole('option', { name: stopbits }).click()

  // Set unit ID
  const unitIdInput = p.getByTestId('client-unitid-input').locator('input')
  await unitIdInput.fill(unitId)
}

/** Load a client config from a JSON file via the client file input */
export async function loadClientConfig(p: Page, configPath: string): Promise<void> {
  const fileInput = p.getByTestId('load-config-file-input')
  await fileInput.setInputFiles(configPath)
  await p.waitForTimeout(1000)
}

/**
 * Load a server config from a JSON file via the server file input.
 * Must already be on the server view.
 */
export async function loadServerConfig(p: Page, configPath: string): Promise<void> {
  const fileInput = p.getByTestId('server-open-file-input')
  await fileInput.setInputFiles(configPath)
  await p.waitForTimeout(1000)
}

/** Navigate to Server view from any view */
export async function navigateToServer(p: Page): Promise<void> {
  if (await p.getByTestId('home-server-btn').isVisible()) {
    await p.getByTestId('home-server-btn').click()
  } else {
    await p.getByTestId('home-btn').click()
    await expect(p.getByTestId('home-server-btn')).toBeVisible({ timeout: 5000 })
    await p.getByTestId('home-server-btn').click()
  }

  // Wait for server view to be ready
  await expect(p.getByTestId('server-name-input')).toBeVisible({ timeout: 5000 })
}

/** Navigate to Client view from any view */
export async function navigateToClient(p: Page): Promise<void> {
  if (await p.getByTestId('home-client-btn').isVisible()) {
    await p.getByTestId('home-client-btn').click()
  } else {
    await p.getByTestId('home-btn').click()
    await expect(p.getByTestId('home-client-btn')).toBeVisible({ timeout: 5000 })
    await p.getByTestId('home-client-btn').click()
  }

  // Wait for client view to be ready (use protocol-agnostic element)
  await expect(p.getByTestId('protocol-tcp-btn')).toBeVisible({ timeout: 5000 })
}

/** Navigate to Home from any view */
export async function navigateToHome(p: Page): Promise<void> {
  if (await p.getByTestId('home-server-btn').isVisible()) {
    return
  }
  await p.getByTestId('home-btn').click()
  await expect(p.getByTestId('home-server-btn')).toBeVisible({ timeout: 5000 })
}

/**
 * Clean server state: delete extra servers, clear all registers on server 502.
 * Call this at the start of any spec that needs a clean slate.
 */
export async function cleanServerState(p: Page): Promise<void> {
  await navigateToServer(p)

  // Delete extra servers until only 1 remains
  let toggleButtons = p.locator('[data-testid^="select-server-"]')
  let count = await toggleButtons.count()

  while (count > 1) {
    for (let i = count - 1; i >= 0; i--) {
      const testId = await toggleButtons.nth(i).getAttribute('data-testid')
      if (testId !== 'select-server-502') {
        await toggleButtons.nth(i).click()
        await p.waitForTimeout(300)
        await p.getByTestId('delete-server-btn').click()
        await p.waitForTimeout(500)
        break
      }
    }
    toggleButtons = p.locator('[data-testid^="select-server-"]')
    count = await toggleButtons.count()
  }

  // Select server 502 and clear everything
  await p.getByTestId('select-server-502').click()
  await p.waitForTimeout(300)
  await p.getByTestId('server-clear-btn').click()
  await p.waitForTimeout(500)
}

/**
 * Toggle advanced mode (and 64-bit values) in the client menu.
 * Idempotent: only clicks checkboxes when their state doesn't match `enabled`.
 */
export async function setAdvancedMode(p: Page, enabled: boolean): Promise<void> {
  if (enabled) await selectRegisterType(p, 'Holding Registers')

  await p.getByTestId('menu-btn').click()
  await p.getByTestId('advanced-mode-checkbox').waitFor({ state: 'visible', timeout: 5000 })

  const advInput = p.getByTestId('advanced-mode-checkbox').locator('input[type="checkbox"]')
  if ((await advInput.isChecked()) !== enabled) {
    await p.getByTestId('advanced-mode-checkbox').click()
    await p.waitForTimeout(200)
  }

  if (enabled) {
    const show64Input = p.getByTestId('show-64bit-checkbox').locator('input[type="checkbox"]')
    if (!(await show64Input.isChecked())) {
      await p.getByTestId('show-64bit-checkbox').click()
      await p.waitForTimeout(200)
    }
  }

  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
}

/** Convenience alias for setAdvancedMode(p, true) */
export const enableAdvancedMode = (p: Page): Promise<void> => setAdvancedMode(p, true)

/** Convenience alias for setAdvancedMode(p, false) */
export const disableAdvancedMode = (p: Page): Promise<void> => setAdvancedMode(p, false)

// ─── Shared helpers extracted from specs ───────────────────────────

/** Scroll the DataGrid virtual scroller so a specific row is visible */
export async function scrollToRow(p: Page, rowId: number): Promise<void> {
  const row = p.locator(`.MuiDataGrid-row[data-id="${rowId}"]`)
  const scroller = p.locator('.MuiDataGrid-virtualScroller')

  // If already visible, nothing to do
  if ((await row.count()) > 0 && (await row.isVisible())) return

  // Scroll down in steps until the row appears
  const scrollHeight = await scroller.evaluate((el: HTMLElement) => el.scrollHeight)
  const step = 300
  for (let pos = 0; pos <= scrollHeight; pos += step) {
    await scroller.evaluate((el: HTMLElement, y: number) => (el.scrollTop = y), pos)
    await p.waitForTimeout(150)
    if ((await row.count()) > 0 && (await row.isVisible())) return
  }
}

/** Read a cell value, scrolling to the row if needed */
export async function scrollCell(p: Page, rowId: number, field: string): Promise<string> {
  await scrollToRow(p, rowId)
  return cell(p, rowId, field)
}

/** Set server endianness (must be on the server view) */
export async function setServerEndianness(p: Page, endian: 'be' | 'le'): Promise<void> {
  const btn = p.getByTestId(`server-endian-${endian}-btn`)
  await btn.click()
  await expect(btn).toHaveClass(/Mui-selected/)
}

/** Set client endianness (must be on the client view) */
export async function setClientEndianness(p: Page, endian: 'be' | 'le'): Promise<void> {
  const btn = p.getByTestId(`endian-${endian}-btn`)
  await btn.click()
  await expect(btn).toHaveClass(/Mui-selected/)
}

/** Write a value to a holding register via the write dialog */
export async function writeRegister(
  p: Page,
  address: number,
  value: string,
  fc: 'fc6' | 'fc16',
  dataType?: string
): Promise<void> {
  await p.getByTestId(`write-action-${address}`).click()
  await expect(p.getByTestId('write-value-input')).toBeVisible()

  if (dataType) {
    await selectDataType(p, dataType)
  }

  const valueInput = p.getByTestId('write-value-input').locator('input')
  await valueInput.fill(value)

  await p.getByTestId(`write-${fc}-btn`).click()
  // Close the write dialog
  await p.keyboard.press('Escape')
  await expect(p.getByTestId('write-value-input')).not.toBeVisible({ timeout: 5000 })
}

/** Write a coil state via the write dialog */
export async function writeCoil(p: Page, address: number, state: boolean): Promise<void> {
  await p.getByTestId(`write-action-${address}`).click()
  await expect(p.getByTestId(`write-coil-${address}-select-btn`)).toBeVisible()

  if (state) {
    await p.getByTestId(`write-coil-${address}-select-btn`).click()
  }

  await p.getByTestId('write-fc5-btn').click()
  await p.getByTestId('write-submit-btn').click()

  // Close the dialog
  await p.keyboard.press('Escape')
  await expect(p.getByTestId(`write-coil-${address}-select-btn`)).not.toBeVisible()
}

/** Ensure a server panel is in the desired collapse state */
export async function setServerPanelCollapsed(
  p: Page,
  type: 'holding_registers' | 'input_registers' | 'coils' | 'discrete_inputs',
  collapsed: boolean
): Promise<void> {
  const isExpanded = await p.getByTestId(`add-${type}-btn`).isVisible()
  if (collapsed === isExpanded) {
    await p.getByTestId(`section-${type}`).click()
  }
}

/** Expand all server panels (useful for cleanup after collapsing) */
export async function expandAllServerPanels(p: Page): Promise<void> {
  for (const type of [
    'coils',
    'discrete_inputs',
    'holding_registers',
    'input_registers'
  ] as const) {
    await setServerPanelCollapsed(p, type, false)
  }
}

/** Clear all registers of a given type on the server */
export async function clearRegisterType(
  p: Page,
  type: 'holding_registers' | 'input_registers' | 'coils' | 'discrete_inputs'
): Promise<void> {
  await p.getByTestId(`delete-${type}-btn`).click()
  await expect(p.getByTestId(`section-${type}`)).toContainText('(0)')
}

/** Load dummy data at a specific address range (must be disconnected) */
export async function loadDummyData(p: Page, address: string, length: string): Promise<void> {
  await test.step(`load dummy data @ ${address} (len ${length})`, async () => {
    const addressInput = p.getByTestId('reg-address-input').locator('input')
    await addressInput.fill(address)
    const lengthInput = p.getByTestId('reg-length-input').locator('input')
    await lengthInput.fill(length)

    await p.getByTestId('menu-btn').click()
    const dummyBtn = p.getByTestId('load-dummy-data-btn')
    await expect(dummyBtn).toBeVisible()
    await dummyBtn.click()

    // Wait for the first row of this range to appear
    await expect(p.locator(`.MuiDataGrid-row[data-id="${address}"]`)).toBeVisible()
  })
}

/** Get the port of the second server (navigates to server view and back to client) */
export async function getServer2Port(p: Page): Promise<string> {
  await navigateToServer(p)

  const toggleButtons = p.locator('[data-testid^="select-server-"]')
  const secondServer = toggleButtons.nth(1)
  await secondServer.click()
  await expect(p.getByTestId('server-port-input')).toBeVisible()

  const portInput = p.getByTestId('server-port-input').locator('input')
  const port = await portInput.inputValue()

  await navigateToClient(p)
  return port
}
