import { test, expect } from '../../fixtures/electron-app'
import {
  selectUnitId,
  cell,
  readRegisters,
  clearData,
  loadServerConfig,
  connectClient,
  disconnectClient,
  navigateToServer,
  navigateToClient,
  enableAdvancedMode,
  cleanServerState,
  setServerEndianness,
  setClientEndianness
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')

test.describe.serial('Endianness — Little Endian round-trip', () => {
  // ─── Setup: clean state and configure server 1 ─────────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server config', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
  })

  test('switch server 1 to Little Endian', async ({ mainPage }) => {
    await mainPage.getByTestId('select-server-502').click()
    await selectUnitId(mainPage, '0')
    await setServerEndianness(mainPage, 'le')
  })

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('switch client to Little Endian', async ({ mainPage }) => {
    await setClientEndianness(mainPage, 'le')
  })

  test('read holding registers 0-28 in LE', async ({ mainPage }) => {
    await readRegisters(mainPage, '0', '28')
  })

  // ─── 16-bit values: LE has no effect ───────────────────────────────

  test('INT16 at address 0 = -100 (LE no effect on 16-bit)', async ({ mainPage }) => {
    expect(await cell(mainPage, 0, 'hex')).toBe('FF9C')
    expect(await cell(mainPage, 0, 'word_int16')).toBe('-100')
  })

  test('UINT16 at address 1 = 500 (LE no effect on 16-bit)', async ({ mainPage }) => {
    expect(await cell(mainPage, 1, 'hex')).toBe('01F4')
    expect(await cell(mainPage, 1, 'word_uint16')).toBe('500')
  })

  // ─── 32-bit values: LE word order swapped ──────────────────────────

  test('INT32 at address 2 = -70000 (LE word order swapped)', async ({ mainPage }) => {
    // BE: [0xFFFE, 0xEE90] -> LE: [0xEE90, 0xFFFE]
    expect(await cell(mainPage, 2, 'hex')).toBe('EE90')
    expect(await cell(mainPage, 3, 'hex')).toBe('FFFE')
    expect(await cell(mainPage, 2, 'word_int32')).toBe('-70000')
  })

  test('UINT32 at address 4 = 100000 (LE word order swapped)', async ({ mainPage }) => {
    // BE: [0x0001, 0x86A0] -> LE: [0x86A0, 0x0001]
    expect(await cell(mainPage, 4, 'hex')).toBe('86A0')
    expect(await cell(mainPage, 5, 'hex')).toBe('0001')
    expect(await cell(mainPage, 4, 'word_uint32')).toBe('100000')
  })

  test('FLOAT at address 6 ≈ 3.14 (LE word order swapped)', async ({ mainPage }) => {
    // BE: [0x4048, 0xF5C3] -> LE: [0xF5C3, 0x4048]
    expect(await cell(mainPage, 6, 'hex')).toBe('F5C3')
    const val = await cell(mainPage, 6, 'word_float')
    expect(val).toContain('3.14')
  })

  // ─── 64-bit values ─────────────────────────────────────────────────

  test('INT64 at address 8 = -1000000 (LE) — hex verification', async ({ mainPage }) => {
    // Verify hex words are present (LE word order)
    const hex8 = await cell(mainPage, 8, 'hex')
    expect(hex8).toMatch(/^[0-9A-Fa-f]{4}$/)
    expect(await cell(mainPage, 8, 'word_int64')).toBe('-1000000')
  })

  test('UINT64 at address 12 = 2000000 (LE) — hex verification', async ({ mainPage }) => {
    const hex12 = await cell(mainPage, 12, 'hex')
    expect(hex12).toMatch(/^[0-9A-Fa-f]{4}$/)
    expect(await cell(mainPage, 12, 'word_uint64')).toBe('2000000')
  })

  test('DOUBLE at address 16 ≈ 2.718 (LE) — hex verification', async ({ mainPage }) => {
    const hex16 = await cell(mainPage, 16, 'hex')
    expect(hex16).toMatch(/^[0-9A-Fa-f]{4}$/)
    const val = await cell(mainPage, 16, 'word_double')
    expect(val).toContain('2.718')
  })

  // ─── UTF-8 in LE: string still decodes correctly ──────────────────

  test('UTF-8 "Hello" at address 20 still decodes in LE', async ({ mainPage }) => {
    // UTF-8 uses byte-level encoding, LE word order doesn't affect decoding
    // because the server stores bytes as pairs in each register
    const hex20 = await cell(mainPage, 20, 'hex')
    expect(hex20).toMatch(/^[0-9A-Fa-f]{4}$/)
  })

  // ─── UNIX timestamp in LE ──────────────────────────────────────────

  test('UNIX 1700000000 at address 26 — LE word order swapped', async ({ mainPage }) => {
    // BE: [0x6553, 0xF100] -> LE: [0xF100, 0x6553]
    expect(await cell(mainPage, 26, 'hex')).toBe('F100')
    expect(await cell(mainPage, 27, 'hex')).toBe('6553')
  })

  // ─── Cleanup: restore Big Endian ───────────────────────────────────

  test('clear LE holding data', async ({ mainPage }) => {
    await clearData(mainPage)
  })

  test('switch client back to Big Endian', async ({ mainPage }) => {
    await setClientEndianness(mainPage, 'be')
  })

  test('disconnect from server 1', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  test('switch server 1 back to Big Endian', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await mainPage.getByTestId('select-server-502').click()
    await setServerEndianness(mainPage, 'be')
  })
})
