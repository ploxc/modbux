// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// The root store registers IPC listeners (window.electron.ipcRenderer) and runs
// init() (window.api.*) at import time. Stub both before the store is imported.
vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy({}, { get: () => () => Promise.resolve(undefined) })
})

import { render, screen } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { RegisterType } from '@shared'
import RegisterConfig from '../RegisterConfig'

// Read configuration reads the addresses a data type was set on. What the
// button offers has to be that same set, because a mapping it cannot read
// leaves the user with an empty grid and two disabled fields.

const seed = (type: RegisterType, mapping: Record<number, object>): void => {
  useClientZustand.setState({
    registerConfig: { ...useClientZustand.getState().registerConfig, type },
    registerMapping: {
      coils: {},
      discrete_inputs: {},
      input_registers: {},
      holding_registers: {},
      [type]: mapping
    }
  } as never)
}

beforeEach(() => {
  useClientZustand.setState({ ready: true, readConfiguration: false } as never)
})

describe('RegisterConfig read configuration', () => {
  it('offers the button for a mapping that carries a data type', () => {
    seed('holding_registers', { 0: { dataType: 'int16' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeEnabled()
  })

  it('refuses a mapping of comments on a bit type', () => {
    seed('coils', { 0: { comment: 'Inverter ON' }, 1: { comment: 'Grid Relay' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  it('refuses a mapping of comments on a register type', () => {
    seed('holding_registers', { 0: { comment: 'label only' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  it('refuses an address whose data type was set back to none', () => {
    seed('holding_registers', { 0: { dataType: 'none', comment: 'label only' } })

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })

  it('refuses an empty mapping', () => {
    seed('holding_registers', {})

    render(<RegisterConfig />)

    expect(screen.getByTestId('reg-read-config-btn')).toBeDisabled()
  })
})
