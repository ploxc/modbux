// @vitest-environment happy-dom
//
// The grid's rows carry no values, so every cell that shows one reads it from
// the store, and shows what the last poll left there.
import { describe, expect, it, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { act, render, screen } from '@testing-library/react'
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid/models'
import { ReactNode } from 'react'
import { getDummyRegisterData, MAIN_CLIENT_UUID } from '@shared'
import type { RegisterData } from '@shared'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { useClientZustand } from '@renderer/context/client.zustand'
import { MAIN_UNIT_UUID } from '@renderer/context/client.zustand.helpers'
import { SectionTypeContext } from '../../../sectionType'
import { skeletonRows } from '../../skeletonRows'
import { skeletonOf } from '@renderer/context/live.zustand.helpers'
import { hexColumn } from '../hex'
import { valueColumn } from '../value'
import { convertedValueColumn } from '../convertedValue'

const type = 'holding_registers'

const poll = (...rows: RegisterData[]): void =>
  act(() => useLiveZustand.getState().setRegisterData(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, rows))

const rowWith = (
  address: number,
  value: number,
  fields: Partial<RegisterData> = {}
): RegisterData => {
  const dummy = getDummyRegisterData(address)
  return {
    ...dummy,
    hex: value.toString(16).padStart(4, '0'),
    words: dummy.words && { ...dummy.words, int16: value, uint16: value },
    ...fields
  }
}

/** Draw a column's cell for `address` as the grid does: from its skeleton row. */
const drawCell = (column: GridColDef<RegisterData>, address: number): void => {
  const { renderCell } = column
  if (!renderCell) throw new Error(`the ${column.field} column has no renderCell`)
  const [row] = skeletonRows(skeletonOf([getDummyRegisterData(address)]))
  if (!row) throw new Error('no skeleton row')
  const params = { row, id: address, field: column.field } as GridRenderCellParams<RegisterData>
  render(
    <SectionTypeContext.Provider value={type}>
      <div data-testid="cell">{renderCell(params) as ReactNode}</div>
    </SectionTypeContext.Provider>
  )
}

const cellText = (): string => screen.getByTestId('cell').textContent ?? ''

describe('a value cell', () => {
  it('shows the hex a poll read, and the next', () => {
    poll(rowWith(0, 0x12))
    drawCell(hexColumn, 0)
    expect(cellText()).toBe('0012')

    poll(rowWith(0, 0xab))
    expect(cellText()).toBe('00AB')
  })

  it('shows the word a poll read, and the next', () => {
    poll(rowWith(0, 7))
    drawCell(valueColumn('uint16', 70), 0)
    expect(cellText()).toBe('7')

    poll(rowWith(0, 9))
    expect(cellText()).toBe('9')
  })

  it('shows the value of its own address, not of the row beside it', () => {
    poll(rowWith(0, 1), rowWith(1, 2))
    drawCell(valueColumn('uint16', 70), 1)
    expect(cellText()).toBe('2')
  })

  it('shows the converted value, and the error a failed read left', () => {
    useClientZustand.getState().setRegisterMapping('holding_registers', 0, 'dataType', 'uint16')
    poll(rowWith(0, 5))
    drawCell(convertedValueColumn({}, false, []), 0)
    expect(cellText()).toBe('5')

    poll(rowWith(0, 5, { error: 'Timed out' }))
    expect(cellText()).toBe('Timed out')
  })
})
