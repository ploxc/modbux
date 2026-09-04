// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Address 10 is mapped as a float and address 11 is not mapped at all, which is
// the pair the dialog has to tell apart.
vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(() => undefined, {
    getState: () => ({
      registerMapping: { holding_registers: { 10: { dataType: 'float' } } },
      registerConfig: { type: 'holding_registers' }
    })
  })
}))
vi.mock('@renderer/context/data.zustand', () => ({
  useDataZustand: Object.assign(() => undefined, { getState: () => ({ registerData: [] }) })
}))

import { DataTypeSelect } from '../WriteModal'
import { useValueInputZustand } from '../writeModal.zustand'

describe('the data type the dialog opens with', () => {
  beforeEach(() => {
    useValueInputZustand.setState({ dataType: 'int16' })
  })

  it('takes the type the register mapping gives the address', () => {
    render(<DataTypeSelect address={10} />)

    expect(useValueInputZustand.getState().dataType).toBe('float')
  })

  it('does not carry the previous address type over to an unmapped address', () => {
    // The store outlives the dialog, so this is the state left behind by
    // opening address 10 and closing it again.
    useValueInputZustand.setState({ dataType: 'float' })

    render(<DataTypeSelect address={11} />)

    expect(useValueInputZustand.getState().dataType).toBe('int16')
  })
})
