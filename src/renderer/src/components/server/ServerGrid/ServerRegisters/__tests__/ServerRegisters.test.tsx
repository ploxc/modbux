// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ServerRegister, ServerRegisterEntry, ServerRegisterValue } from '@shared'

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

/**
 * A register of `dataType` at address 6, holding the composite the store folds.
 *
 * A `datetime` entry holds that composite as a decimal string, because it fills
 * 64 bits as an integer and a JS number carries 53 of them. `unix` is a uint32
 * and holds a number.
 */
const registerAt6 = (
  dataType: 'unix' | 'datetime',
  value: ServerRegisterValue
): ServerRegisterEntry => ({
  value,
  params: {
    address: 6,
    registerType: 'holding_registers',
    dataType,
    comment: 'timestamp',
    // `params.value` is the fixed value the dialog stored and stays a number;
    // the entry's own `value` is the composite the store folds.
    value: 0,
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

/** One composite value out of the four IEC 870-5 words, as the store holds it. */
const packed = (word1: number, word2: number, word3: number, word4: number): string =>
  (
    BigInt(word1) * 2n ** 48n +
    BigInt(word2) * 2n ** 32n +
    BigInt(word3) * 2n ** 16n +
    BigInt(word4)
  ).toString()

// 2024/06/01 12:34:56.789 UTC
const JUNE_2024 = packed(0x0018, 0x0601, 0x0c22, 0xddd5)

describe('what the server row shows for a timestamp', () => {
  it('decodes a datetime out of the composite value', async () => {
    const cell = await valueCellFor(registerAt6('datetime', JUNE_2024))
    expect(cell).toHaveTextContent('2024/06/01 12:34:56')
  })

  it('shows a dash for a datetime register the server has not written', async () => {
    const cell = await valueCellFor(registerAt6('datetime', '0'))
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

  // The end of the window the format carries, which rounded up by one
  // millisecond through `Number` and read 2100/01/01 00:00:00.
  it('reads the last second the format holds', async () => {
    const cell = await valueCellFor(
      registerAt6('datetime', packed(99, (12 << 8) | 31, (23 << 8) | 59, 59999))
    )
    expect(cell).toHaveTextContent('2099/12/31 23:59:59')
  })

  // `ServerRegisterEntrySchema` takes a fractional number for a 64 bit type, so
  // a hand-edited config reaches a value no composite can be read out of.
  it('shows a dash for a datetime value that is not a whole number', async () => {
    const cell = await valueCellFor(registerAt6('datetime', 0.5))
    expect(cell).toHaveTextContent('—')
  })
})
