// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_WRITE_BITS } from '@shared'

// The picker draws over the window the toolbar read, which is this config.
const { registerConfig } = vi.hoisted(() => ({
  registerConfig: { address: 0, length: 0 }
}))
vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(
    (selector: (state: { registerConfig: { address: number; length: number } }) => unknown) =>
      selector({ registerConfig }),
    { getState: () => ({ registerConfig }) }
  )
}))
vi.mock('@renderer/context/data.zustand', () => ({
  useDataZustand: Object.assign(() => undefined, { getState: () => ({ registerData: [] }) })
}))

import { Coils } from '../WriteModal'
import { useValueInputZustand } from '../writeModal.zustand'

const drawn = (): number => screen.getAllByTestId(/^write-coil-\d+-select-btn$/).length

beforeEach(() => {
  registerConfig.address = 0
  registerConfig.length = 2000
  useValueInputZustand.setState({
    address: 0,
    coilFunction: 15,
    coils: new Array<boolean>(2000).fill(false)
  })
})

// The Length field took the 2000 bits FC01 answers, and every coil drawn is an
// MUI Button with a store subscription of its own. One FC15 writes 1968 of
// them, so the ones past that could be pressed and went nowhere.
describe('the coil picker', () => {
  it('draws no more coils than one request writes', () => {
    render(<Coils />)

    expect(drawn()).toBe(MAX_WRITE_BITS)
  })

  it('draws a window that fits whole', () => {
    registerConfig.length = 125
    useValueInputZustand.setState({ coils: new Array<boolean>(125).fill(false) })

    render(<Coils />)

    expect(drawn()).toBe(125)
  })

  // The picker starts at the coil the action cell was on, so what is left of
  // the window is what it draws.
  it('draws from the coil the dialog opened on', () => {
    useValueInputZustand.setState({ address: 1500 })

    render(<Coils />)

    expect(drawn()).toBe(500)
  })
})
