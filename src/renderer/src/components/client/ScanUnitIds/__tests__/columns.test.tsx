// @vitest-environment happy-dom
//
// A refusal is not a silence, and the cell says which by the colour it carries.
// The e2e spec reaches two of the four answers: it asserts `.scan-silent` has
// no cell, because every unit in it replies.
import { describe, it, expect, vi } from 'vitest'

// The column set is built from the store the dialog holds, and that store's
// module imports the client store, which calls main at import time.
vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (): (() => void) => (): void => {},
      send: (): void => {},
      invoke: (): Promise<undefined> => Promise.resolve(undefined)
    }
  }
  w.api = new Proxy(
    {},
    { get: (): (() => Promise<undefined>) => (): Promise<undefined> => Promise.resolve(undefined) }
  )
})

import { renderHook } from '@testing-library/react'
import { GridColDef } from '@mui/x-data-grid/models'
import { RegisterType, ScanUnitIDResult } from '@shared'
import useScanUnitIdColumns from '../columns'
import { useScanUnitIdZustand } from '../scanUnitIds.zustand'

const EVERY_TYPE: RegisterType[] = [
  'coils',
  'discrete_inputs',
  'holding_registers',
  'input_registers'
]

/** One unit that answered, refused and said nothing, and was asked once more. */
const row: ScanUnitIDResult = {
  id: 7,
  registerTypes: ['coils'],
  refusedRegisterTypes: ['discrete_inputs'],
  requestedRegisterTypes: ['coils', 'discrete_inputs', 'holding_registers'],
  errorMessage: {
    coils: '',
    discrete_inputs: '',
    holding_registers: '',
    input_registers: ''
  }
}

const columnOf = (columns: GridColDef<ScanUnitIDResult>[], field: RegisterType): GridColDef => {
  const column = columns.find((candidate) => candidate.field === field)
  if (!column) throw new Error(`no column for ${field}`)
  return column
}

/** The word the filter reads, and the class the grid paints the cell with. */
const cell = (field: RegisterType): { value: unknown; className: unknown } => {
  useScanUnitIdZustand.setState({ registerTypes: EVERY_TYPE })
  const { result } = renderHook(() => useScanUnitIdColumns())
  const column = columnOf(result.current, field)
  const { valueGetter, cellClassName } = column
  if (!valueGetter) throw new Error(`the ${field} column has no valueGetter`)
  if (typeof cellClassName !== 'function') throw new Error(`the ${field} column has no class`)

  return {
    value: valueGetter(undefined as never, row, column, undefined as never),
    className: cellClassName({ row } as never)
  }
}

describe('what a unit id did with one request', () => {
  it('answered with data', () => {
    expect(cell('coils')).toEqual({ value: 'answered', className: 'scan-answered' })
  })

  it('answered with an exception', () => {
    expect(cell('discrete_inputs')).toEqual({ value: 'refused', className: 'scan-refused' })
  })

  it('was asked and said nothing', () => {
    expect(cell('holding_registers')).toEqual({ value: 'silent', className: 'scan-silent' })
  })

  // A type the scan never asked for is not an outcome. `null` keeps the row out
  // of every one of the three filters rather than into one of them.
  it('was never asked', () => {
    expect(cell('input_registers')).toEqual({ value: null, className: '' })
  })
})
