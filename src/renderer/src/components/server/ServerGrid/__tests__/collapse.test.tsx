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
const serverState = {
  selectedUuid: 'main',
  getUnitId: (): string => '0',
  unitId: { main: '0' },
  serverRegisters: { main: { '0': { coils } } }
}

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

import ServerBooleans from '../ServerBooleans'
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
