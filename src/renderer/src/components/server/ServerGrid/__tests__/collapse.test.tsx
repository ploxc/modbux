// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// `ServerBit` carried a `readOnly` prop, set from one place,
// `readOnly={collapse}` in `ServerBoolRow`. `ServerBooleans` renders that list
// only under `{!collapse && ...}`, and both read the same store, so React
// renders the parent first and no committed render could carry `readOnly: true`.
// The same half guarded `ServerBoolRow`'s hover styles and its remove button,
// and two tests in `ServerBit.test.tsx` asserted behaviour nothing reached.
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ServerBool } from '@shared'

const coils: ServerBool = { 0: { value: true, comment: 'run' } }
const holdingRegisters = {
  0: {
    value: 7,
    params: {
      address: 0,
      dataType: 'int16' as const,
      registerType: 'holding_registers' as const,
      comment: 'level'
    }
  }
}
const serverState = {
  selectedUuid: 'main',
  getUnitId: (): string => '0',
  servers: {
    main: {
      unitId: '0',
      registers: { '0': { coils, holding_registers: holdingRegisters } }
    }
  }
}

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

import ServerBooleans from '../ServerBooleans'
import ServerRegisters from '../ServerRegisters/ServerRegisters'
import useServerGridZustand from '../serverGrid.zustand'

const allOpen = {
  coils: false,
  discrete_inputs: false,
  input_registers: false,
  holding_registers: false
}

describe('a collapsed boolean section', () => {
  it('shows its bits while it is open', () => {
    useServerGridZustand.setState({ collapse: allOpen })
    render(<ServerBooleans name="Coils" type="coils" />)

    expect(screen.getByTestId('server-bool-coils-circle-0')).toBeInTheDocument()
    expect(screen.getByTestId('remove-bool-coils-0')).toBeInTheDocument()
  })

  it('renders no bit at all once collapsed', () => {
    useServerGridZustand.setState({ collapse: { ...allOpen, coils: true } })
    render(<ServerBooleans name="Coils" type="coils" />)

    expect(screen.queryByTestId('server-bool-coils-circle-0')).toBeNull()
    expect(screen.queryByTestId('server-bool-row-coils-0')).toBeNull()
  })
})

// Both sections are one `ServerPanel` now, and the guard that hides the list
// went with it. `ServerBooleans` was the only caller a test reached.
describe('a collapsed register section', () => {
  it('shows its rows while it is open', () => {
    useServerGridZustand.setState({ collapse: allOpen })
    render(<ServerRegisters name="Holding Registers" type="holding_registers" />)

    expect(screen.getByTestId('server-reg-value-holding_registers-0')).toBeInTheDocument()
    expect(screen.getByTestId('server-edit-reg-holding_registers-0')).toBeInTheDocument()
  })

  it('renders no row at all once collapsed', () => {
    useServerGridZustand.setState({ collapse: { ...allOpen, holding_registers: true } })
    render(<ServerRegisters name="Holding Registers" type="holding_registers" />)

    expect(screen.queryByTestId('server-reg-value-holding_registers-0')).toBeNull()
    expect(screen.queryByTestId('server-edit-reg-holding_registers-0')).toBeNull()
  })
})
