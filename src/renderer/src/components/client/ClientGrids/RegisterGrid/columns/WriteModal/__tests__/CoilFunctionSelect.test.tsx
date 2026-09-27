// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// WriteModal reaches both root stores, and each registers ipcRenderer listeners
// on import. This one reads the address the toolbar last read from.
vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(
    (selector: (state: { section: { address: number } }) => unknown) =>
      selector({ section: { address: 0 } }),
    { getState: () => ({}) }
  ),
  selectedClientUuid: (): string => 'the-client',
  // The mock holds the coil section flat, under one key.
  selectedUnit: <Section,>(state: { section: Section }): { sections: { coils: Section } } => ({
    sections: { coils: state.section }
  }),
  getSelectedUnit: (): { uuid: string } => ({ uuid: 'the-unit' })
}))
vi.mock('@renderer/components/client/ClientGrids/sectionType', () => ({
  useSectionType: (): string => 'coils'
}))
vi.mock('@renderer/context/live.zustand', () => ({
  useLiveZustand: Object.assign(() => undefined, { getState: () => ({ registerData: [] }) })
}))

import { CoilFunctionSelect } from '../WriteModal'
import { useValueInputZustand } from '../writeModal.zustand'

const mockWrite = vi.fn()

// @ts-expect-error - Mocking window.api for tests
global.window.api = { write: mockWrite }

const written = (): boolean[] => {
  const payload = mockWrite.mock.calls[0]?.[0] as
    | { uuid: string; parameters: { value: boolean[] } }
    | undefined
  return payload?.parameters.value ?? []
}

// FC15 writes the coils the picker draws: from the one the dialog opened on, at
// most 64, and no further than the window the toolbar read.
describe('the coil write', () => {
  beforeEach(() => {
    mockWrite.mockClear()
    useValueInputZustand.setState({
      address: 0,
      coilFunction: 15,
      coils: new Array<boolean>(2000).fill(true)
    })
  })

  it('sends at most 64 coils', async () => {
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(written().length).toBe(64)
  })

  it('sends a window shorter than that whole', async () => {
    useValueInputZustand.setState({ coils: new Array<boolean>(40).fill(true) })
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(written().length).toBe(40)
  })

  it('starts at the coil the dialog opened on', async () => {
    useValueInputZustand.setState({ address: 1990 })
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-submit-btn'))

    expect(written().length).toBe(10)
  })
})

// FC5 writes the coil the dialog opened on, and the dialog says which state it
// sends: FALSE or TRUE, the one it opened with pressed.
describe('the single coil write', () => {
  beforeEach(() => {
    mockWrite.mockClear()
    useValueInputZustand.setState({
      address: 3,
      coilFunction: 5,
      coils: [false, false, false, true, false]
    })
  })

  it('opens on the state the coil has', () => {
    render(<CoilFunctionSelect />)

    expect(screen.getByTestId('write-coil-3-true-btn')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('write-coil-3-false-btn')).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends FALSE once FALSE is pressed', async () => {
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-coil-3-false-btn'))
    await user.click(screen.getByTestId('write-submit-btn'))

    const payload = mockWrite.mock.calls[0]?.[0] as
      | { parameters: { address: number; single: boolean; value: boolean[] } }
      | undefined
    expect(payload?.parameters.address).toBe(3)
    expect(payload?.parameters.single).toBe(true)
    expect(payload?.parameters.value[0]).toBe(false)
  })

  it('keeps TRUE when TRUE is pressed again', async () => {
    const user = userEvent.setup()
    render(<CoilFunctionSelect />)

    await user.click(screen.getByTestId('write-coil-3-true-btn'))

    expect(useValueInputZustand.getState().coils[3]).toBe(true)
  })
})
