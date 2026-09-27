// @vitest-environment happy-dom
//
// The grid's rows carry no values, so the row reads from the store whether its
// register failed to read, and marks itself for it.
import { describe, expect, it, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

// MUI's row needs the whole grid around it; what it is handed is the question.
vi.mock('@mui/x-data-grid/components', () => ({
  GridRow: ({ className }: { className?: string }): JSX.Element => (
    <div data-testid="grid-row" className={className} />
  )
}))

import { act, render, screen } from '@testing-library/react'
import { GridRowProps } from '@mui/x-data-grid/components'
import { getDummyRegisterData, MAIN_CLIENT_UUID } from '@shared'
import type { RegisterData } from '@shared'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { MAIN_UNIT_UUID } from '@renderer/context/client.zustand.helpers'
import { SectionTypeContext } from '../../sectionType'
import BitMapRow from '../BitMapRow'

const type = 'holding_registers'

const poll = (...rows: RegisterData[]): void =>
  act(() => useLiveZustand.getState().setRegisterData(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, rows))

const drawRow = (address: number): void => {
  const props = { rowId: address, className: 'MuiDataGrid-row' } as unknown as GridRowProps
  render(
    <SectionTypeContext.Provider value={type}>
      <BitMapRow {...props} />
    </SectionTypeContext.Provider>
  )
}

const rowClass = (): string => screen.getByTestId('grid-row').className

describe('a row whose register failed to read', () => {
  it('is marked, and keeps the class the grid gave it', () => {
    poll({ ...getDummyRegisterData(0), error: 'Timed out' })
    drawRow(0)
    expect(rowClass()).toBe('MuiDataGrid-row register-error-row')
  })

  it('is unmarked once a poll reads it', () => {
    poll({ ...getDummyRegisterData(0), error: 'Timed out' })
    drawRow(0)

    poll(getDummyRegisterData(0))

    expect(rowClass()).toBe('MuiDataGrid-row')
  })

  it('is not marked for the failure of the register beside it', () => {
    poll(getDummyRegisterData(0), { ...getDummyRegisterData(1), error: 'Timed out' })
    drawRow(0)
    expect(rowClass()).toBe('MuiDataGrid-row')
  })
})
