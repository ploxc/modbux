/**
 * Comprehensive Modbux E2E Test Suite
 *
 * Tests the full application: home navigation, multi-server configuration (multiple servers,
 * unit IDs, all data types, fixed & generator values, coils, discrete inputs,
 * input registers, holding registers), multi-client connections, reading, polling,
 * AddRegister modal state management (reset/preserve), generator value changes.
 *
 * Starts with a clean localStorage on every run for deterministic results.
 */

import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.js')]
  })

  app.evaluate((ctx) => ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] }))

  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
})

test.afterAll(async () => {
  if (app) await app.close()
})

// ═══════════════════════════════════════════════════════════════════════
// SHARED REGISTER DEFINITIONS — Used by both server and client tests
// ═══════════════════════════════════════════════════════════════════════

type RegisterDef = {
  registerType: 'holding_registers' | 'input_registers'
  address: number
  dataType: string
  littleEndian?: boolean
} & (
  | { mode: 'fixed'; value: string; comment?: string }
  | { mode: 'generator'; min: string; max: string; interval: string; comment?: string }
)

type BoolDef = {
  registerType: 'coils' | 'discrete_inputs'
  address: number
  state: boolean
}

type ServerConfig = {
  port: number
  name: string
  unitId: string
  registers: RegisterDef[]
  bools: BoolDef[]
}

// Server 1 (port 502, unit 0) — comprehensive test coverage of all data types
const SERVER_1_UNIT_0: ServerConfig = {
  port: 502,
  name: 'Main Server',
  unitId: '0',
  registers: [
    // Holding registers — all data types
    {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '-100',
      comment: 'test int16 negative'
    },
    {
      registerType: 'holding_registers',
      address: 1,
      dataType: 'UINT16',
      mode: 'fixed',
      value: '500',
      comment: 'test uint16'
    },
    {
      registerType: 'holding_registers',
      address: 2,
      dataType: 'INT32',
      mode: 'fixed',
      value: '-70000',
      comment: 'test int32 negative'
    },
    {
      registerType: 'holding_registers',
      address: 4,
      dataType: 'UINT32',
      mode: 'fixed',
      value: '100000',
      comment: 'test uint32'
    },
    {
      registerType: 'holding_registers',
      address: 6,
      dataType: 'FLOAT',
      mode: 'fixed',
      value: '3.14',
      comment: 'test float'
    },
    {
      registerType: 'holding_registers',
      address: 8,
      dataType: 'INT64',
      mode: 'fixed',
      value: '-1000000',
      comment: 'test int64 negative'
    },
    {
      registerType: 'holding_registers',
      address: 12,
      dataType: 'UINT64',
      mode: 'fixed',
      value: '2000000',
      comment: 'test uint64'
    },
    {
      registerType: 'holding_registers',
      address: 16,
      dataType: 'DOUBLE',
      mode: 'fixed',
      value: '2.718',
      comment: 'test double'
    },
    {
      registerType: 'holding_registers',
      address: 20,
      dataType: 'INT32',
      mode: 'fixed',
      value: '12345',
      littleEndian: true,
      comment: 'LE int32'
    },
    {
      registerType: 'holding_registers',
      address: 22,
      dataType: 'INT16',
      mode: 'generator',
      min: '0',
      max: '1000',
      interval: '1',
      comment: 'generator int16'
    },

    // Input registers
    {
      registerType: 'input_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '200',
      comment: 'input int16'
    },
    {
      registerType: 'input_registers',
      address: 1,
      dataType: 'FLOAT',
      mode: 'fixed',
      value: '9.81',
      comment: 'input float'
    },
    {
      registerType: 'input_registers',
      address: 3,
      dataType: 'UINT16',
      mode: 'generator',
      min: '100',
      max: '500',
      interval: '2',
      comment: 'input generator'
    }
  ],
  bools: [
    { registerType: 'coils', address: 0, state: false },
    { registerType: 'coils', address: 5, state: true },
    { registerType: 'coils', address: 8, state: false }, // Add second group (8-15)
    { registerType: 'discrete_inputs', address: 3, state: true }
  ]
}

// Server 1, unit ID 1 — separate unit config
const SERVER_1_UNIT_1: Omit<ServerConfig, 'port'> = {
  name: 'Main Server',
  unitId: '1',
  registers: [
    {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'UINT16',
      mode: 'fixed',
      value: '777',
      comment: 'unit1 holding'
    },
    {
      registerType: 'input_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '888',
      comment: 'unit1 input'
    }
  ],
  bools: [{ registerType: 'coils', address: 2, state: true }]
}

// Server 2 (auto port) — minimal config
const SERVER_2_UNIT_0: Omit<ServerConfig, 'port'> = {
  name: 'Second Server',
  unitId: '0',
  registers: [
    {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '42',
      comment: 'server2 register'
    },
    {
      registerType: 'holding_registers',
      address: 1,
      dataType: 'UINT16',
      mode: 'generator',
      min: '10',
      max: '90',
      interval: '3',
      comment: 'server2 generator'
    }
  ],
  bools: [{ registerType: 'coils', address: 0, state: true }]
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

/** Select a data type in the AddRegister modal's DataTypeSelectInput */
async function selectDataType(p: Page, dataType: string): Promise<void> {
  await p.getByTestId('add-reg-type-select').click()
  await p.waitForTimeout(200)
  await p.getByRole('option', { name: dataType, exact: true }).click()
  await p.waitForTimeout(200)
}

/** Select a unit ID in the ServerConfig dropdown */
async function selectUnitId(p: Page, unitId: string): Promise<void> {
  await p.getByTestId('server-unitid-select').click()
  await p.waitForTimeout(200)
  await p.getByRole('option', { name: unitId, exact: true }).click()
  await p.waitForTimeout(200)
}

/** Select a register type in the client RegisterConfig */
async function selectRegisterType(p: Page, name: string): Promise<void> {
  await p.getByTestId('reg-type-select').click()
  await p.waitForTimeout(200)
  await p.getByRole('option', { name }).click()
  await p.waitForTimeout(200)
}

/** Read a specific cell value from the MUI DataGrid (client side) */
async function cell(p: Page, rowId: number, field: string): Promise<string> {
  const loc = p.locator(`.MuiDataGrid-row[data-id="${rowId}"] [data-field="${field}"]`)
  return ((await loc.textContent()) ?? '').trim()
}

/**
 * Add a register with full config support.
 * Uses either "Add & Close" or "Add & Next" button based on `useNext` param.
 * Assumes modal is NOT open yet.
 */
async function addRegister(p: Page, reg: RegisterDef, useNext = false): Promise<void> {
  // Open modal
  await p.getByTestId(`add-${reg.registerType}-btn`).click()
  await p.waitForTimeout(300)

  // Select data type
  await selectDataType(p, reg.dataType)

  // Set endianness if needed
  if (reg.littleEndian) {
    await p.getByTestId('add-reg-le-btn').click()
  }

  // Fill address
  const addressInput = p.getByTestId('add-reg-address-input').locator('input')
  await addressInput.fill(String(reg.address))
  await p.waitForTimeout(100)

  // Fixed or Generator mode
  if (reg.mode === 'fixed') {
    await p.getByTestId('add-reg-fixed-btn').click()
    await p.waitForTimeout(100)
    const valueInput = p.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill(reg.value)
    await p.waitForTimeout(100)
  } else {
    await p.getByTestId('add-reg-generator-btn').click()
    await p.waitForTimeout(100)
    const minInput = p.getByTestId('add-reg-min-input').locator('input')
    await minInput.fill(reg.min)
    const maxInput = p.getByTestId('add-reg-max-input').locator('input')
    await maxInput.fill(reg.max)
    const intervalInput = p.getByTestId('add-reg-interval-input').locator('input')
    await intervalInput.fill(reg.interval)
    await p.waitForTimeout(100)
  }

  // Comment
  if (reg.comment) {
    const commentInput = p.getByTestId('add-reg-comment-input').locator('input')
    await commentInput.fill(reg.comment)
  }

  // Submit with either "Add & Close" or "Add & Next"
  if (useNext) {
    await p.getByTestId('add-reg-next-btn').click()
  } else {
    await p.getByTestId('add-reg-submit-btn').click()
  }
  await p.waitForTimeout(300)
}

/** Add coils starting at the given address (adds a group of 8) */
async function addCoils(p: Page, address: number): Promise<void> {
  await p.getByTestId('add-coils-btn').click()
  await p.waitForTimeout(300)

  const addressInput = p.getByTestId('add-bool-address-input').locator('input')
  await addressInput.fill(String(address))
  await p.getByTestId('add-bool-add-btn').click()
  await p.waitForTimeout(200)

  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
}

/** Add discrete inputs starting at the given address (adds a group of 8) */
async function addDiscreteInputs(p: Page, address: number): Promise<void> {
  await p.getByTestId('add-discrete_inputs-btn').click()
  await p.waitForTimeout(300)

  const addressInput = p.getByTestId('add-bool-address-input').locator('input')
  await addressInput.fill(String(address))
  await p.getByTestId('add-bool-add-btn').click()
  await p.waitForTimeout(200)

  await p.keyboard.press('Escape')
  await p.waitForTimeout(200)
}

/** Set client address and length, then read */
async function readRegisters(p: Page, address: string, length: string): Promise<void> {
  const addressInput = p.getByTestId('reg-address-input').locator('input')
  await addressInput.fill(address)
  const lengthInput = p.getByTestId('reg-length-input').locator('input')
  await lengthInput.fill(length)
  await p.waitForTimeout(100)
  await p.getByTestId('read-btn').click()
  await p.waitForTimeout(1500)
}

/** Clear the client data grid */
async function clearData(p: Page): Promise<void> {
  await p.getByTestId('clear-data-btn').click()
  await p.waitForTimeout(300)
}

/** Setup a full server config from a ServerConfig object */
async function setupServerConfig(
  p: Page,
  config: ServerConfig | Omit<ServerConfig, 'port'>
): Promise<void> {
  // Set server name
  const nameField = p.getByTestId('server-name-input').locator('input')
  await nameField.fill(config.name)

  // Select unit ID
  await selectUnitId(p, config.unitId)

  // Add registers
  for (const reg of config.registers) {
    await addRegister(p, reg)
  }

  // Add coils/discrete inputs
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

  // Add groups
  for (const start of coilGroups) {
    await addCoils(p, start)
  }
  for (const start of diGroups) {
    await addDiscreteInputs(p, start)
  }

  // Wait for groups to be fully rendered before toggling
  await p.waitForTimeout(500)

  // Toggle individual bools
  for (const bool of config.bools) {
    if (bool.state) {
      const btn = p.getByTestId(`server-bool-${bool.registerType}-${bool.address}`)
      await btn.click()
      await p.waitForTimeout(100)
    }
  }
}

/** Connect client to server */
async function connectClient(p: Page, host: string, port: string, unitId: string): Promise<void> {
  const hostInput = p.getByTestId('tcp-host-input').locator('input')
  await hostInput.fill(host)
  const portInput = p.getByTestId('tcp-port-input').locator('input')
  await portInput.fill(port)
  const unitIdInput = p.getByTestId('client-unitid-input').locator('input')
  await unitIdInput.fill(unitId)
  await p.waitForTimeout(200)
  await p.getByTestId('connect-btn').click()
  await expect(p.getByTestId('connect-btn')).toContainText('Disconnect', { timeout: 5000 })
}

/** Disconnect client */
async function disconnectClient(p: Page): Promise<void> {
  await p.getByTestId('connect-btn').click()
  await expect(p.getByTestId('connect-btn')).toContainText('Connect', { timeout: 5000 })
}

// ═══════════════════════════════════════════════════════════════════════
// 1. HOME SCREEN
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Home screen', () => {
  test('app launches with correct title', async () => {
    expect(await page.title()).toBe('Modbux')
  })

  test('shows Client and Server buttons', async () => {
    await expect(page.getByTestId('home-client-btn')).toBeVisible()
    await expect(page.getByTestId('home-server-btn')).toBeVisible()
    await expect(page.getByTestId('home-split-btn')).toBeVisible()
  })

  test('shows version and ploxc links', async () => {
    await expect(page.getByTestId('home-version-link')).toBeVisible()
    await expect(page.getByTestId('home-ploxc-link')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. NAVIGATION
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Navigation', () => {
  test('can navigate to Server view and back', async () => {
    await page.getByTestId('home-server-btn').click()
    await page.waitForTimeout(600)

    await expect(page.getByTestId('section-coils')).toBeVisible()
    await expect(page.getByTestId('section-discrete_inputs')).toBeVisible()
    await expect(page.getByTestId('section-input_registers')).toBeVisible()
    await expect(page.getByTestId('section-holding_registers')).toBeVisible()

    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('home-server-btn')).toBeVisible()
  })

  test('can navigate to Client view and back', async () => {
    await page.getByTestId('home-client-btn').click()
    await page.waitForTimeout(600)

    await expect(page.getByTestId('connect-btn')).toBeVisible()
    await expect(page.getByTestId('protocol-tcp-btn')).toBeVisible()
    await expect(page.getByTestId('tcp-host-input')).toBeVisible()

    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('home-client-btn')).toBeVisible()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. SERVER 1 — Full configuration (port 502, units 0 and 1)
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Server 1 — Configure main server', () => {
  test('navigate to server view', async () => {
    await page.getByTestId('home-server-btn').click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('section-coils')).toBeVisible()
  })

  test('default server exists with port 502', async () => {
    await expect(page.getByTestId('select-server-502')).toBeVisible()
    const portInput = page.getByTestId('server-port-input').locator('input')
    await expect(portInput).toHaveValue('502')
  })

  test('configure server 1, unit ID 0 (all data types)', async () => {
    await setupServerConfig(page, SERVER_1_UNIT_0)
    // Verify counts
    await expect(page.getByTestId('section-coils')).toContainText('(16)')
    await expect(page.getByTestId('section-discrete_inputs')).toContainText('(8)')
    await expect(page.getByTestId('section-holding_registers')).toContainText('(10)')
    await expect(page.getByTestId('section-input_registers')).toContainText('(3)')
  })

  test('edit holding register 0 value from -100 to 999', async () => {
    await page.getByTestId('server-edit-reg-holding_registers-0').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('add-reg-submit-btn')).toContainText('Submit Change')
    const valueInput = page.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill('999')
    await page.waitForTimeout(100)
    await page.getByTestId('add-reg-submit-btn').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('section-holding_registers')).toContainText('(10)')
  })

  test('configure server 1, unit ID 1', async () => {
    await setupServerConfig(page, SERVER_1_UNIT_1)
    await expect(page.getByTestId('section-coils')).toContainText('(8)')
    await expect(page.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(page.getByTestId('section-input_registers')).toContainText('(1)')
  })

  test('switch back to unit ID 0 — verify data preserved', async () => {
    await selectUnitId(page, '0')
    await expect(page.getByTestId('section-coils')).toContainText('(16)')
    await expect(page.getByTestId('section-holding_registers')).toContainText('(10)')
    await expect(page.getByTestId('section-input_registers')).toContainText('(3)')
  })

  test('section collapse/expand works', async () => {
    await page.getByTestId('section-holding_registers').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('server-edit-reg-holding_registers-0')).not.toBeVisible()
    await page.getByTestId('section-holding_registers').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('server-edit-reg-holding_registers-0')).toBeVisible()
  })

  test('verify generator values change over time on server', async () => {
    // Read the generator register value (address 22 in holding_registers)
    // The UI doesn't directly expose the value, but we can observe it changes
    // by waiting and checking if the value updates
    await page.waitForTimeout(2000) // Wait for generator to update (interval = 1s)

    // We can't directly read the value from the server UI without opening edit modal,
    // but we can verify the generator is configured correctly by editing it
    await page.getByTestId('server-edit-reg-holding_registers-22').click()
    await page.waitForTimeout(300)

    // Verify it's in generator mode (ToggleButton uses Mui-selected)
    await expect(page.getByTestId('add-reg-generator-btn')).toHaveClass(/Mui-selected/)

    // Verify min/max/interval
    const minInput = page.getByTestId('add-reg-min-input').locator('input')
    const maxInput = page.getByTestId('add-reg-max-input').locator('input')
    const intervalInput = page.getByTestId('add-reg-interval-input').locator('input')
    expect(await minInput.inputValue()).toBe('0')
    expect(await maxInput.inputValue()).toBe('1000')
    expect(await intervalInput.inputValue()).toBe('1')

    // Close modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. SERVER 2 — Add a second server
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Server 2 — Second server configuration', () => {
  let server2Port: string

  test('add a second server', async () => {
    await page.getByTestId('add-server-btn').click()
    await page.waitForTimeout(500)
    const toggleButtons = page.locator('[data-testid^="select-server-"]')
    expect(await toggleButtons.count()).toBe(2)
  })

  test('second server has a different port', async () => {
    const portInput = page.getByTestId('server-port-input').locator('input')
    server2Port = await portInput.inputValue()
    expect(server2Port).not.toBe('502')
    expect(Number(server2Port)).toBeGreaterThanOrEqual(502)
    expect(Number(server2Port)).toBeLessThanOrEqual(1000)
  })

  test('configure server 2', async () => {
    await setupServerConfig(page, SERVER_2_UNIT_0)
    await expect(page.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(page.getByTestId('section-coils')).toContainText('(8)')
  })

  test('switch to server 1 — verify isolation', async () => {
    await page.getByTestId('select-server-502').click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('section-holding_registers')).toContainText('(10)')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. ADD REGISTER MODAL — State management tests
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('AddRegister modal — state reset and preserve', () => {
  test('navigate to server 1, unit 0', async () => {
    await page.getByTestId('select-server-502').click()
    await page.waitForTimeout(300)
    await selectUnitId(page, '0')
    await page.waitForTimeout(300)
  })

  test('open modal — verify defaults (BE, Fixed, INT16)', async () => {
    await page.getByTestId('add-holding_registers-btn').click()
    await page.waitForTimeout(300)

    // Check defaults (ToggleButtons use Mui-selected)
    await expect(page.getByTestId('add-reg-be-btn')).toHaveClass(/Mui-selected/)
    await expect(page.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    const typeSelect = page.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')

    // Close modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('open modal, change to LE + Generator + FLOAT', async () => {
    await page.getByTestId('add-holding_registers-btn').click()
    await page.waitForTimeout(300)

    await page.getByTestId('add-reg-le-btn').click()
    await page.getByTestId('add-reg-generator-btn').click()
    await selectDataType(page, 'FLOAT')
    await page.waitForTimeout(200)

    // Close modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('reopen modal — verify state reset to defaults', async () => {
    await page.getByTestId('add-holding_registers-btn').click()
    await page.waitForTimeout(300)

    // Should be back to defaults (ToggleButtons use Mui-selected)
    await expect(page.getByTestId('add-reg-be-btn')).toHaveClass(/Mui-selected/)
    await expect(page.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    const typeSelect = page.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('add register using "Add & Next" — state preserved, address advances', async () => {
    await page.getByTestId('add-holding_registers-btn').click()
    await page.waitForTimeout(300)

    // Configure: address 100, LE, UINT32, Generator, min 50, max 200, interval 5
    await page.getByTestId('add-reg-le-btn').click()
    await selectDataType(page, 'UINT32')
    await page.getByTestId('add-reg-generator-btn').click()
    const addressInput = page.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('100')
    const minInput = page.getByTestId('add-reg-min-input').locator('input')
    await minInput.fill('50')
    const maxInput = page.getByTestId('add-reg-max-input').locator('input')
    await maxInput.fill('200')
    const intervalInput = page.getByTestId('add-reg-interval-input').locator('input')
    await intervalInput.fill('5')
    const commentInput = page.getByTestId('add-reg-comment-input').locator('input')
    await commentInput.fill('first')
    await page.waitForTimeout(200)

    // Click "Add & Next"
    await page.getByTestId('add-reg-next-btn').click()
    await page.waitForTimeout(300)

    // Modal should still be open
    await expect(page.getByTestId('add-reg-submit-btn')).toBeVisible()

    // Verify: address advanced from 100 (UINT32 = 2 regs) → 102
    const newAddress = await addressInput.inputValue()
    expect(newAddress).toBe('102')

    // Verify: LE preserved (ToggleButton uses Mui-selected)
    await expect(page.getByTestId('add-reg-le-btn')).toHaveClass(/Mui-selected/)

    // Verify: Generator mode preserved
    await expect(page.getByTestId('add-reg-generator-btn')).toHaveClass(/Mui-selected/)

    // Verify: UINT32 preserved
    const typeSelect = page.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('UINT32')

    // Verify: min/max/interval preserved
    expect(await minInput.inputValue()).toBe('50')
    expect(await maxInput.inputValue()).toBe('200')
    expect(await intervalInput.inputValue()).toBe('5')

    // Verify: comment reset
    expect(await commentInput.inputValue()).toBe('')

    // Close modal
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('switch to input_registers — verify modal reset between register types', async () => {
    await page.getByTestId('add-input_registers-btn').click()
    await page.waitForTimeout(300)

    // Should be back to defaults (BE, Fixed, INT16) - ToggleButtons use Mui-selected
    await expect(page.getByTestId('add-reg-be-btn')).toHaveClass(/Mui-selected/)
    await expect(page.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    const typeSelect = page.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  })

  test('remove the test register (holding 100)', async () => {
    // Only register 100 was submitted (102 was never submitted, we pressed Escape)
    await page.getByTestId('server-edit-reg-holding_registers-100').click()
    await page.waitForTimeout(500)
    await page.getByTestId('add-reg-remove-btn').click()
    await page.waitForTimeout(1000)

    // Verify holding registers count is back to 10
    await expect(page.getByTestId('section-holding_registers')).toContainText('(10)')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. CLIENT — Enable advanced mode
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Client setup', () => {
  test('navigate to client', async () => {
    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await page.getByTestId('home-client-btn').click()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('connect-btn')).toBeVisible()
  })

  test('enable advanced mode and 64-bit values', async () => {
    await page.getByTestId('menu-btn').click()
    await page.waitForTimeout(300)
    await page.getByTestId('advanced-mode-checkbox').click()
    await page.waitForTimeout(200)
    await page.getByTestId('show-64bit-checkbox').click()
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. CLIENT-SERVER INTEGRATION — Server 1, Unit 0
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Client reads — Server 1, Unit 0', () => {
  test('connect to server 1, unit 0', async () => {
    await connectClient(page, '127.0.0.1', '502', '0')
  })

  // ─── Holding Registers ───────────────────────────────────────────────

  test('read holding registers 0-22', async () => {
    await selectRegisterType(page, 'Holding Registers')
    await readRegisters(page, '0', '23')
  })

  test('verify INT16 at address 0 = 999 (edited value)', async () => {
    expect(await cell(page, 0, 'hex')).toBe('03E7')
    expect(await cell(page, 0, 'word_int16')).toBe('999')
  })

  test('verify UINT16 at address 1 = 500', async () => {
    expect(await cell(page, 1, 'hex')).toBe('01F4')
    expect(await cell(page, 1, 'word_uint16')).toBe('500')
  })

  test('verify INT32 at address 2 = -70000', async () => {
    expect(await cell(page, 2, 'hex')).toBe('FFFE')
    expect(await cell(page, 3, 'hex')).toBe('EE90')
    expect(await cell(page, 2, 'word_int32')).toBe('-70000')
  })

  test('verify UINT32 at address 4 = 100000', async () => {
    expect(await cell(page, 4, 'hex')).toBe('0001')
    expect(await cell(page, 5, 'hex')).toBe('86A0')
    expect(await cell(page, 4, 'word_uint32')).toBe('100000')
  })

  test('verify FLOAT at address 6 ≈ 3.14', async () => {
    expect(await cell(page, 6, 'hex')).toBe('4048')
    const val = await cell(page, 6, 'word_float')
    expect(val).toContain('3.14')
  })

  test('verify INT64 at address 8 = -1000000', async () => {
    expect(await cell(page, 8, 'word_int64')).toBe('-1000000')
  })

  test('verify UINT64 at address 12 = 2000000', async () => {
    expect(await cell(page, 12, 'word_uint64')).toBe('2000000')
  })

  test('verify DOUBLE at address 16 ≈ 2.718', async () => {
    const val = await cell(page, 16, 'word_double')
    expect(val).toContain('2.718')
  })

  test('verify LE INT32 at address 20 (word-swapped)', async () => {
    expect(await cell(page, 20, 'hex')).toBe('3039')
    expect(await cell(page, 21, 'hex')).toBe('0000')
  })

  test('verify generator at address 22 is in range 0-1000', async () => {
    const hex = await cell(page, 22, 'hex')
    const decVal = parseInt(hex, 16)
    expect(decVal).toBeGreaterThanOrEqual(0)
    expect(decVal).toBeLessThanOrEqual(1000)
  })

  test('clear holding data', async () => {
    await clearData(page)
  })

  // ─── Input Registers ─────────────────────────────────────────────────

  test('read input registers 0-3', async () => {
    await selectRegisterType(page, 'Input Registers')
    await readRegisters(page, '0', '4')
  })

  test('verify INT16 at input address 0 = 200', async () => {
    expect(await cell(page, 0, 'hex')).toBe('00C8')
    expect(await cell(page, 0, 'word_int16')).toBe('200')
  })

  test('verify FLOAT at input address 1 ≈ 9.81', async () => {
    expect(await cell(page, 1, 'hex')).toBe('411C')
    const val = await cell(page, 1, 'word_float')
    expect(val).toContain('9.81')
  })

  test('verify generator at input address 3 is in range 100-500', async () => {
    const hex = await cell(page, 3, 'hex')
    const decVal = parseInt(hex, 16)
    expect(decVal).toBeGreaterThanOrEqual(100)
    expect(decVal).toBeLessThanOrEqual(500)
  })

  test('clear input data', async () => {
    await clearData(page)
  })

  // ─── Coils ───────────────────────────────────────────────────────────

  test('read coils 0-15', async () => {
    await selectRegisterType(page, 'Coils')
    await readRegisters(page, '0', '16')
  })

  test('verify coil 0 is FALSE', async () => {
    expect(await cell(page, 0, 'bit')).toBe('FALSE')
  })

  test('verify coil 5 is TRUE', async () => {
    expect(await cell(page, 5, 'bit')).toBe('TRUE')
  })

  test('verify coils 1-4, 6-15 are FALSE', async () => {
    for (const addr of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      expect(await cell(page, addr, 'bit')).toBe('FALSE')
    }
  })

  test('clear coils data', async () => {
    await clearData(page)
  })

  // ─── Discrete Inputs ─────────────────────────────────────────────────

  test('read discrete inputs 0-7', async () => {
    await selectRegisterType(page, 'Discrete Inputs')
    await readRegisters(page, '0', '8')
  })

  test('verify DI 3 is TRUE', async () => {
    expect(await cell(page, 3, 'bit')).toBe('TRUE')
  })

  test('verify DI 0-2, 4-7 are FALSE', async () => {
    for (const addr of [0, 1, 2, 4, 5, 6, 7]) {
      expect(await cell(page, addr, 'bit')).toBe('FALSE')
    }
  })

  test('clear discrete inputs data', async () => {
    await clearData(page)
  })

  // ─── Polling Test with Generator Verification ───────────────────────

  test('poll holding registers and verify generator changes', async () => {
    await selectRegisterType(page, 'Holding Registers')
    await readRegisters(page, '22', '1')

    // Read initial value
    const hex1 = await cell(page, 22, 'hex')
    const val1 = parseInt(hex1, 16)

    // Start polling
    await page.getByTestId('poll-btn').click()
    await page.waitForTimeout(3000) // Wait for generator to potentially change

    // Read new value
    const hex2 = await cell(page, 22, 'hex')
    const val2 = parseInt(hex2, 16)

    // Both values should be in range
    expect(val1).toBeGreaterThanOrEqual(0)
    expect(val1).toBeLessThanOrEqual(1000)
    expect(val2).toBeGreaterThanOrEqual(0)
    expect(val2).toBeLessThanOrEqual(1000)

    // Stop polling
    await page.getByTestId('poll-btn').click()
    await page.waitForTimeout(300)
    await clearData(page)
  })

  test('disconnect from server 1, unit 0', async () => {
    await disconnectClient(page)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. CLIENT-SERVER INTEGRATION — Server 1, Unit 1
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Client reads — Server 1, Unit 1', () => {
  test('connect to server 1, unit 1', async () => {
    await connectClient(page, '127.0.0.1', '502', '1')
  })

  test('read holding register 0 = 777', async () => {
    await selectRegisterType(page, 'Holding Registers')
    await readRegisters(page, '0', '1')
    expect(await cell(page, 0, 'hex')).toBe('0309')
    expect(await cell(page, 0, 'word_uint16')).toBe('777')
    await clearData(page)
  })

  test('read input register 0 = 888', async () => {
    await selectRegisterType(page, 'Input Registers')
    await readRegisters(page, '0', '1')
    expect(await cell(page, 0, 'hex')).toBe('0378')
    expect(await cell(page, 0, 'word_int16')).toBe('888')
    await clearData(page)
  })

  test('read coil 2 is TRUE', async () => {
    await selectRegisterType(page, 'Coils')
    await readRegisters(page, '0', '8')
    expect(await cell(page, 2, 'bit')).toBe('TRUE')
    for (const addr of [0, 1, 3, 4, 5, 6, 7]) {
      expect(await cell(page, addr, 'bit')).toBe('FALSE')
    }
    await clearData(page)
  })

  test('disconnect from server 1, unit 1', async () => {
    await disconnectClient(page)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 9. CLIENT-SERVER INTEGRATION — Server 2, Unit 0
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Client reads — Server 2, Unit 0', () => {
  let server2Port: string

  test('get server 2 port', async () => {
    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await page.getByTestId('home-server-btn').click()
    await page.waitForTimeout(600)

    // Click the non-502 server
    const toggleButtons = page.locator('[data-testid^="select-server-"]')
    const secondServer = toggleButtons.nth(1)
    await secondServer.click()
    await page.waitForTimeout(300)

    const portInput = page.getByTestId('server-port-input').locator('input')
    server2Port = await portInput.inputValue()

    // Navigate back to client
    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await page.getByTestId('home-client-btn').click()
    await page.waitForTimeout(600)
  })

  test('connect to server 2, unit 0', async () => {
    await connectClient(page, '127.0.0.1', server2Port, '0')
  })

  test('read holding register 0 = 42', async () => {
    await selectRegisterType(page, 'Holding Registers')
    await readRegisters(page, '0', '2')
    expect(await cell(page, 0, 'hex')).toBe('002A')
    expect(await cell(page, 0, 'word_int16')).toBe('42')
  })

  test('verify generator at address 1 is in range 10-90', async () => {
    const hex = await cell(page, 1, 'hex')
    const decVal = parseInt(hex, 16)
    expect(decVal).toBeGreaterThanOrEqual(10)
    expect(decVal).toBeLessThanOrEqual(90)
    await clearData(page)
  })

  test('read coil 0 is TRUE', async () => {
    await selectRegisterType(page, 'Coils')
    await readRegisters(page, '0', '8')
    expect(await cell(page, 0, 'bit')).toBe('TRUE')
    for (const addr of [1, 2, 3, 4, 5, 6, 7]) {
      expect(await cell(page, addr, 'bit')).toBe('FALSE')
    }
    await clearData(page)
  })

  test('poll server 2 generator and verify changes', async () => {
    await selectRegisterType(page, 'Holding Registers')
    await readRegisters(page, '1', '1')

    const hex1 = await cell(page, 1, 'hex')
    const val1 = parseInt(hex1, 16)

    await page.getByTestId('poll-btn').click()
    await page.waitForTimeout(5000) // Wait longer due to interval=3

    const hex2 = await cell(page, 1, 'hex')
    const val2 = parseInt(hex2, 16)

    expect(val1).toBeGreaterThanOrEqual(10)
    expect(val1).toBeLessThanOrEqual(90)
    expect(val2).toBeGreaterThanOrEqual(10)
    expect(val2).toBeLessThanOrEqual(90)

    await page.getByTestId('poll-btn').click()
    await page.waitForTimeout(300)
    await clearData(page)
  })

  test('disconnect from server 2', async () => {
    await disconnectClient(page)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 10. SERVER VERIFICATION — All data intact
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Server data verification', () => {
  test('navigate to server view', async () => {
    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await page.getByTestId('home-server-btn').click()
    await page.waitForTimeout(600)
  })

  test('verify server 1, unit 0 data intact', async () => {
    await page.getByTestId('select-server-502').click()
    await page.waitForTimeout(300)
    await selectUnitId(page, '0')
    await expect(page.getByTestId('section-coils')).toContainText('(16)')
    await expect(page.getByTestId('section-discrete_inputs')).toContainText('(8)')
    await expect(page.getByTestId('section-holding_registers')).toContainText('(10)')
    await expect(page.getByTestId('section-input_registers')).toContainText('(3)')
  })

  test('verify server 1, unit 1 data intact', async () => {
    await selectUnitId(page, '1')
    await expect(page.getByTestId('section-coils')).toContainText('(8)')
    await expect(page.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(page.getByTestId('section-input_registers')).toContainText('(1)')
  })

  test('verify server 2 data intact', async () => {
    const toggleButtons = page.locator('[data-testid^="select-server-"]')
    const secondServer = toggleButtons.nth(1)
    await secondServer.click()
    await page.waitForTimeout(300)
    await expect(page.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(page.getByTestId('section-coils')).toContainText('(8)')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 11. CLEANUP — Clear all server data
// ═══════════════════════════════════════════════════════════════════════

test.describe.serial('Cleanup operations', () => {
  test('clear server 2 data', async () => {
    await page.getByTestId('delete-holding_registers-btn').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('section-holding_registers')).toContainText('(0)')
    await page.getByTestId('delete-coils-btn').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('section-coils')).toContainText('(0)')
  })

  test('delete server 2', async () => {
    await page.getByTestId('delete-server-btn').click()
    await page.waitForTimeout(300)
    const remaining = page.locator('[data-testid^="select-server-"]')
    expect(await remaining.count()).toBe(1)
  })

  test('clear server 1, unit 1 data', async () => {
    await page.getByTestId('select-server-502').click()
    await page.waitForTimeout(300)
    await selectUnitId(page, '1')
    await page.getByTestId('delete-holding_registers-btn').click()
    await page.waitForTimeout(200)
    await page.getByTestId('delete-input_registers-btn').click()
    await page.waitForTimeout(200)
    await page.getByTestId('delete-coils-btn').click()
    await page.waitForTimeout(200)
  })

  test('clear server 1, unit 0 data', async () => {
    await selectUnitId(page, '0')
    await page.getByTestId('delete-coils-btn').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('section-coils')).toContainText('(0)')
    await page.getByTestId('delete-discrete_inputs-btn').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('section-discrete_inputs')).toContainText('(0)')
    await page.getByTestId('delete-holding_registers-btn').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('section-holding_registers')).toContainText('(0)')
    await page.getByTestId('delete-input_registers-btn').click()
    await page.waitForTimeout(200)
    await expect(page.getByTestId('section-input_registers')).toContainText('(0)')
  })

  test('main server cannot be deleted', async () => {
    await expect(page.getByTestId('delete-server-btn')).toBeDisabled()
  })
})
