// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The picker draws over the window the toolbar read, which is this config.
const { registerConfig } = vi.hoisted(() => ({
  registerConfig: { address: 0, length: 0 }
}))
vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(
    (selector: (state: { registerConfig: { address: number; length: number } }) => unknown) =>
      selector({ registerConfig }),
    { getState: () => ({ registerConfig }) }
  ),
  // The mock holds the coil section flat, under one key.
  selectedUnit: <Section,>(state: {
    registerConfig: Section
  }): { sections: { coils: Section } } => ({ sections: { coils: state.registerConfig } })
}))
vi.mock('@renderer/components/client/ClientGrids/sectionType', () => ({
  useSectionType: (): string => 'coils'
}))
vi.mock('@renderer/context/live.zustand', () => ({
  getShownSection: (): { registerData: [] } => ({ registerData: [] })
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

// The picker draws what one FC15 from the dialog writes: at most 64 coils, from
// the one the dialog opened on to the end of the window the toolbar read.
describe('the coil picker', () => {
  it('draws at most 64 coils', () => {
    render(<Coils />)

    expect(drawn()).toBe(64)
  })

  it('draws a window shorter than that whole', () => {
    registerConfig.length = 40
    useValueInputZustand.setState({ coils: new Array<boolean>(40).fill(false) })

    render(<Coils />)

    expect(drawn()).toBe(40)
  })

  it('draws from the coil the dialog opened on to the end of the window', () => {
    useValueInputZustand.setState({ address: 1990 })

    render(<Coils />)

    expect(drawn()).toBe(10)
  })
})

// Rows start on a multiple of eight, so a coil sits under its offset in the
// byte and the row labels read 0, 8, 16.
describe('the rows of the coil picker', () => {
  beforeEach(() => {
    registerConfig.length = 16
    useValueInputZustand.setState({ address: 6, coils: new Array<boolean>(16).fill(false) })
  })

  it('are labelled from the multiple of eight below the coil it opened on', () => {
    render(<Coils />)

    const rows = screen.getAllByTestId(/^write-coil-row-\d+$/).map((row) => row.textContent)
    expect(rows).toEqual(['0', '8'])
  })

  it('draw the coil it opened on and the rest of the window, and none before it', () => {
    render(<Coils />)

    expect(drawn()).toBe(10)
    expect(screen.getByTestId('write-coil-6-select-btn')).toBeInTheDocument()
    expect(screen.getByTestId('write-coil-15-select-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('write-coil-5-select-btn')).not.toBeInTheDocument()
  })
})
