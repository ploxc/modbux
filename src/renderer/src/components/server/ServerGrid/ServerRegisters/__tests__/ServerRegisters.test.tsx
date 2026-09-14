// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ServerRegister, ServerRegisterEntry } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The real server store persists through window.api on import, and the rows
// only need the map for one unit.

const registers: { holding_registers: ServerRegister } = { holding_registers: {} }
const serverState = {
  selectedUuid: 'main',
  getUnitId: (): string => '0',
  unitId: { main: '0' },
  serverRegisters: { main: { '0': registers } }
}

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

import ServerRegisters from '../ServerRegisters'

/** A register of `dataType` at address 6, holding the composite the store folds. */
const registerAt6 = (dataType: 'unix' | 'datetime', value: number): ServerRegisterEntry => ({
  value,
  params: {
    address: 6,
    registerType: 'holding_registers',
    dataType,
    comment: 'timestamp',
    value,
    min: undefined,
    max: undefined,
    interval: undefined
  }
})

/** Render the holding register panel showing one register, and return its value cell. */
const valueCellFor = async (entry: ServerRegisterEntry): Promise<HTMLElement> => {
  registers.holding_registers = { 6: entry }
  render(<ServerRegisters name="Holding Registers" type="holding_registers" />)
  return screen.findByTestId('server-reg-value-holding_registers-6')
}

/** One composite value out of the four IEC 870-5 words, the way the store folds them. */
const packed = (word1: number, word2: number, word3: number, word4: number): number =>
  word1 * 2 ** 48 + word2 * 2 ** 32 + word3 * 2 ** 16 + word4

// 2024/06/01 12:34:56.789 UTC
const JUNE_2024 = packed(0x0018, 0x0601, 0x0c22, 0xddd5)

describe('what the server row shows for a timestamp', () => {
  it('decodes a datetime out of the composite value', async () => {
    const cell = await valueCellFor(registerAt6('datetime', JUNE_2024))
    expect(cell).toHaveTextContent('2024/06/01 12:34:56')
  })

  it('shows a dash for a datetime register the server has not written', async () => {
    const cell = await valueCellFor(registerAt6('datetime', 0))
    expect(cell).toHaveTextContent('—')
  })

  it('shows a dash when the invalid flag is set', async () => {
    const cell = await valueCellFor(registerAt6('datetime', packed(0x0018, 0x0601, 0x0ca2, 0xddd5)))
    expect(cell).toHaveTextContent('—')
  })

  it('shows a dash for a day the month does not have', async () => {
    const cell = await valueCellFor(registerAt6('datetime', packed(0x0018, 0x021f, 0x0c22, 0xddd5)))
    expect(cell).toHaveTextContent('—')
  })

  it('shows a dash for a month outside the year', async () => {
    const cell = await valueCellFor(registerAt6('datetime', packed(0x0018, 0x0d01, 0x0c22, 0xddd5)))
    expect(cell).toHaveTextContent('—')
  })

  it('renders the unix epoch itself rather than a dash', async () => {
    const cell = await valueCellFor(registerAt6('unix', 0))
    expect(cell).toHaveTextContent('1970/01/01 00:00:00')
  })

  it('decodes a unix register out of its seconds', async () => {
    const cell = await valueCellFor(registerAt6('unix', 1700000000))
    expect(cell).toHaveTextContent('2023/11/14 22:13:20')
  })
})
