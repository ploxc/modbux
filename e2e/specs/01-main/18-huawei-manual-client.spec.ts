/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  readRegisters,
  cell,
  scrollCell,
  selectRegisterType,
  enableAdvancedMode,
  disableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  cleanServerState,
  loadServerConfig,
  clearData,
  loadDummyData
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-huawei-smartlogger.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-huawei-smartlogger.json')

// ─── Load client config as single source of truth ─────────────────

interface ClientRegister {
  dataType: string
  scalingFactor: number
  comment: string
  interpolate?: { x1: string; x2: string; y1: string; y2: string }
}

const clientConfig = JSON.parse(readFileSync(CLIENT_CONFIG, 'utf-8'))
const holdingRegisters: Record<string, ClientRegister> =
  clientConfig.registerMapping.holding_registers

const TOTAL_REGISTERS = Object.keys(holdingRegisters).length

// ─── Build address groups from JSON (max 33 rows to avoid virtualization) ──

const DATA_TYPE_WIDTH: Record<string, number> = {
  uint16: 1,
  int16: 1,
  uint32: 2,
  int32: 2,
  float: 2,
  unix: 2,
  uint64: 4,
  int64: 4,
  double: 4,
  datetime: 4
}

function getWidth(dataType: string, currentAddr: number, nextAddr?: number): number {
  if (dataType === 'utf8') {
    return nextAddr !== undefined ? Math.min(nextAddr - currentAddr, 24) : 24
  }
  return DATA_TYPE_WIDTH[dataType] ?? 1
}

interface AddressGroup {
  start: number
  length: number
  registers: Array<{ address: number; reg: ClientRegister }>
}

function buildGroups(regs: Record<string, ClientRegister>, maxLength: number = 33): AddressGroup[] {
  const sorted = Object.entries(regs)
    .map(([addr, reg]) => ({ address: Number(addr), reg }))
    .sort((a, b) => a.address - b.address)

  const groups: AddressGroup[] = []
  let i = 0

  while (i < sorted.length) {
    const startAddr = sorted[i].address
    const groupRegs = [sorted[i]]
    let endAddr =
      startAddr + getWidth(sorted[i].reg.dataType, startAddr, sorted[i + 1]?.address) - 1
    let j = i

    while (j + 1 < sorted.length) {
      const next = sorted[j + 1]
      const nextWidth = getWidth(next.reg.dataType, next.address, sorted[j + 2]?.address)
      const nextEnd = next.address + nextWidth - 1
      const span = Math.max(endAddr, nextEnd) - startAddr + 1

      if (span <= maxLength) {
        endAddr = Math.max(endAddr, nextEnd)
        groupRegs.push(next)
        j++
      } else {
        break
      }
    }

    groups.push({
      start: startAddr,
      length: endAddr - startAddr + 1,
      registers: groupRegs
    })
    i = j + 1
  }

  return groups
}

const GROUPS = buildGroups(holdingRegisters)

// ─── Helpers ──────────────────────────────────────────────────────

/** Configure a register row: dataType, scalingFactor, comment, interpolation */
async function configureRegister(p: any, rowId: number, reg: ClientRegister): Promise<void> {
  const label = `${reg.dataType.toUpperCase()} @ ${rowId}${reg.comment ? ` (${reg.comment})` : ''}`

  await test.step(`configure: ${label}`, async () => {
    const row = p.locator(`.MuiDataGrid-row[data-id="${rowId}"]`)

    // Data type (dropdown select)
    const displayType = reg.dataType.toUpperCase()
    await row.locator('[data-field="dataType"]').dblclick()
    await expect(p.getByRole('option', { name: displayType, exact: true })).toBeVisible()
    await p.getByRole('option', { name: displayType, exact: true }).click()
    await p.keyboard.press('Enter')

    // Scaling factor (only if != 1)
    if (reg.scalingFactor !== 1) {
      await row.locator('[data-field="scalingFactor"]').dblclick()
      const sfInput = row.locator('[data-field="scalingFactor"] input')
      await expect(sfInput).toBeVisible()
      await sfInput.fill(String(reg.scalingFactor))
      await p.keyboard.press('Enter')
    }

    // Comment
    if (reg.comment) {
      await row.locator('[data-field="comment"]').dblclick()
      const commentInput = row.locator('[data-field="comment"] input')
      await expect(commentInput).toBeVisible()
      await commentInput.fill(reg.comment)
      await p.keyboard.press('Enter')
    }

    // Interpolation (modal with x1, x2, y1, y2 fields)
    if (reg.interpolate) {
      const interpBtn = row.locator('button[title="Interpolation"]')
      await interpBtn.click()

      const modal = p.locator('.MuiModal-root')
      await expect(modal).toBeVisible()

      for (const key of ['x1', 'x2', 'y1', 'y2'] as const) {
        const field = modal.locator(`label:has-text("${key}")`).locator('..').locator('input')
        await field.click({ clickCount: 3 })
        await field.fill(reg.interpolate[key])
      }

      await p.keyboard.press('Escape')
      await expect(modal).not.toBeVisible()
    }
  })
}

// ─── Tests ────────────────────────────────────────────────────────

test.describe.serial('Huawei Smart Logger — JSON server + manual client config', () => {
  // ─── Server setup (JSON load) ──────────────────────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load Huawei server config from JSON', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  // ─── Client: dummy data + full manual register configuration ───

  test('navigate to client', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    // Disable advanced mode to avoid horizontal scrolling during cell editing
    // (extra columns push comment/scalingFactor off-screen, causing Playwright scroll delays)
    await disableAdvancedMode(mainPage)
  })

  // Generate a test per address group — all derived from client JSON
  for (const group of GROUPS) {
    test(`configure group ${group.start} (${group.registers.length} regs, len ${group.length})`, async ({
      mainPage
    }) => {
      test.setTimeout(group.registers.length * 2000 + 20_000)

      await loadDummyData(mainPage, String(group.start), String(group.length))

      for (const { address, reg } of group.registers) {
        await configureRegister(mainPage, address, reg)
      }
    })
  }

  // ─── Verify manual config ──────────────────────────────────────

  test(`read config button is enabled (${TOTAL_REGISTERS} registers configured)`, async ({
    mainPage
  }) => {
    await expect(mainPage.getByTestId('reg-read-config-btn')).toBeEnabled()
  })

  // ─── Connect and readConfiguration ─────────────────────────────

  test('connect to server', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('readConfiguration reads all manually configured registers', async ({ mainPage }) => {
    await clearData(mainPage)

    await enableReadConfiguration(mainPage)

    await mainPage.getByTestId('read-btn').click()
    await mainPage.waitForTimeout(5000)

    // DataGrid virtualizes rows — only ~28-35 are in the DOM at once
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThanOrEqual(20)
  })

  test('readConfig validates comments survived', async ({ mainPage }) => {
    // Spot-check comments from different groups (scroll to off-screen rows)
    expect(await scrollCell(mainPage, 40011, 'comment')).toBe('Year')
    expect(await scrollCell(mainPage, 40429, 'comment')).toContain('Power Factor')
    expect(await scrollCell(mainPage, 40700, 'comment')).toBe('DI status (BITMAP)')
    expect(await scrollCell(mainPage, 50000, 'comment')).toBe('Alarm Info 1 (BITMAP)')
  })

  test('readConfig validates scaling factors survived', async ({ mainPage }) => {
    expect(await scrollCell(mainPage, 40428, 'scalingFactor')).toBe('0.1')
    expect(await scrollCell(mainPage, 40429, 'scalingFactor')).toBe('0.001')
    expect(await scrollCell(mainPage, 40685, 'scalingFactor')).toBe('0.01')
    expect(await scrollCell(mainPage, 41934, 'scalingFactor')).toBe('0.001')
  })

  test('readConfig validates hex values are present', async ({ mainPage }) => {
    expect((await scrollCell(mainPage, 40000, 'hex')).length).toBeGreaterThan(0)
    expect((await scrollCell(mainPage, 40700, 'hex')).length).toBeGreaterThan(0)
    expect((await scrollCell(mainPage, 65534, 'hex')).length).toBeGreaterThan(0)
  })

  test('disable read configuration mode', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
  })

  // ─── Range reads with value verification ───────────────────────

  test('enable advanced mode for value verification', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  test('read time range and verify values', async ({ mainPage }) => {
    await readRegisters(mainPage, '40000', '17')

    expect(await cell(mainPage, 40011, 'word_uint16')).toBe('2025')
    expect(await cell(mainPage, 40012, 'word_uint16')).toBe('6')
  })

  test('read power range and verify values', async ({ mainPage }) => {
    await readRegisters(mainPage, '40420', '10')

    expect(await cell(mainPage, 40428, 'word_uint16')).toBe('990')
    expect(await cell(mainPage, 40429, 'word_int16')).toBe('30000')
  })

  test('read generator and verify value', async ({ mainPage }) => {
    await readRegisters(mainPage, '40500', '1')

    const dcVal = Number(await cell(mainPage, 40500, 'word_int16'))
    expect(dcVal).toBeGreaterThanOrEqual(500)
    expect(dcVal).toBeLessThanOrEqual(520)
  })

  test('read energy and verify values', async ({ mainPage }) => {
    await readRegisters(mainPage, '40560', '8')

    expect(await cell(mainPage, 40566, 'word_uint16')).toBe('1')
  })

  test('read voltage/current generators and verify', async ({ mainPage }) => {
    await readRegisters(mainPage, '40572', '6')

    const phaseAVal = Number(await cell(mainPage, 40572, 'word_int16'))
    expect(phaseAVal).toBeGreaterThanOrEqual(5020)
    expect(phaseAVal).toBeLessThanOrEqual(5045)

    const vabVal = Number(await cell(mainPage, 40575, 'word_uint16'))
    expect(vabVal).toBeGreaterThanOrEqual(4000)
    expect(vabVal).toBeLessThanOrEqual(4023)
  })

  test('read DI bitmap and verify', async ({ mainPage }) => {
    await readRegisters(mainPage, '40700', '1')

    expect(await cell(mainPage, 40700, 'word_uint16')).toBe('37')
  })

  test('read alarm bitmaps and verify', async ({ mainPage }) => {
    await readRegisters(mainPage, '50000', '3')

    expect(await cell(mainPage, 50000, 'word_uint16')).toBe('2048')
    expect(await cell(mainPage, 50001, 'word_uint16')).toBe('8')
    expect(await cell(mainPage, 50002, 'word_uint16')).toBe('0')
  })

  test('read public registers and verify', async ({ mainPage }) => {
    await readRegisters(mainPage, '65521', '14')

    expect(await cell(mainPage, 65521, 'word_uint16')).toBe('5')
    expect(await cell(mainPage, 65534, 'word_uint16')).toBe('45057')
  })

  // ─── Save manually created config ──────────────────────────────

  test('save manual config and verify JSON output', async ({ electronApp, mainPage }) => {
    const savePath = resolve(tmpdir(), `modbux-huawei-manual-${Date.now()}.json`)

    await electronApp.evaluate(({ session }, path) => {
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSavePath(path)
      })
    }, savePath)

    await mainPage.getByTestId('save-config-btn').click()
    await mainPage.waitForTimeout(1000)

    const fs = await import('fs/promises')
    const content = await fs.readFile(savePath, 'utf-8')
    const saved = JSON.parse(content)

    expect(saved.version).toBe(2)
    expect(saved.registerMapping).toBeDefined()

    const hr = saved.registerMapping.holding_registers

    // All registers should be in the saved config
    expect(Object.keys(hr).length).toBeGreaterThanOrEqual(TOTAL_REGISTERS - 2)

    // Verify scaling factors round-tripped (spot-check from JSON source)
    for (const [addr, reg] of Object.entries(holdingRegisters) as [string, ClientRegister][]) {
      if (reg.scalingFactor !== 1 && hr[addr]) {
        expect(hr[addr].scalingFactor).toBe(reg.scalingFactor)
      }
    }

    // Verify comments round-tripped
    expect(hr['40011'].comment).toBe('Year')
    expect(hr['40429'].comment).toContain('Power Factor')
    expect(hr['50000'].comment).toBe('Alarm Info 1 (BITMAP)')
    expect(hr['40713'].comment).toBe('ESN')
    expect(hr['65534'].comment).toBe('Device connection status')

    // Verify data types round-tripped
    expect(hr['40000'].dataType.toLowerCase()).toContain('unix')
    expect(hr['40429'].dataType.toLowerCase()).toContain('int16')
    expect(hr['40550'].dataType.toLowerCase()).toContain('uint64')
    expect(hr['40713'].dataType.toLowerCase()).toContain('utf8')

    // Verify interpolation round-tripped
    expect(hr['40429'].interpolate).toBeDefined()
    expect(hr['40429'].interpolate.x1).toBe('0')
    expect(hr['40429'].interpolate.x2).toBe('32767')
    expect(hr['40429'].interpolate.y1).toBe('0.8')
    expect(hr['40429'].interpolate.y2).toBe('1')

    await fs.unlink(savePath).catch(() => {})
  })

  // ─── Cleanup ───────────────────────────────────────────────────

  test('disconnect from server', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })
})
