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

import { render, screen, fireEvent } from '@testing-library/react'
import { useRootZustand } from '@renderer/context/root.zustand'
import MenuRegisterOptions from '../MenuRegisterOptions/MenuRegisterOptions'
import MenuConnectionOptions from '../MenuConnectionOptions/MenuConnectionOptions'

// The options menu groups register options / connection options / actions,
// each section carrying its own trailing divider so empty sections never
// leave a stray separator. These tests guard that null-behaviour and the
// RTU-over-TCP toggle without needing a real Modbus server.

const seed = (partial: Parameters<typeof useRootZustand.setState>[0]): void => {
  useRootZustand.setState(partial as never)
}

beforeEach(() => {
  window.api = { updateConnectionConfig: vi.fn() } as never
  useRootZustand.setState({
    ready: true,
    clientState: {
      connectState: 'disconnected',
      polling: false,
      scanningUniId: false,
      scanningRegisters: false
    }
  } as never)
})

describe('MenuRegisterOptions', () => {
  it('renders advanced/64-bit options with a trailing divider for 16-bit register types', () => {
    seed({
      registerConfig: { ...useRootZustand.getState().registerConfig, type: 'holding_registers' }
    })

    const { container } = render(<MenuRegisterOptions />)

    expect(screen.getByTestId('advanced-mode-checkbox')).toBeInTheDocument()
    expect(screen.getByTestId('show-64bit-checkbox')).toBeInTheDocument()
    expect(container.querySelectorAll('hr')).toHaveLength(1)
  })

  it('renders nothing (no options, no divider) for non-16-bit register types', () => {
    seed({ registerConfig: { ...useRootZustand.getState().registerConfig, type: 'coils' } })

    const { container } = render(<MenuRegisterOptions />)

    expect(screen.queryByTestId('advanced-mode-checkbox')).not.toBeInTheDocument()
    expect(container.querySelectorAll('hr')).toHaveLength(0)
  })
})

describe('MenuConnectionOptions', () => {
  it('renders the RTU-over-TCP checkbox with a trailing divider when TCP is selected', () => {
    seed({
      connectionConfig: { ...useRootZustand.getState().connectionConfig, protocol: 'ModbusTcp' }
    })

    const { container } = render(<MenuConnectionOptions />)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(container.querySelectorAll('hr')).toHaveLength(1)
  })

  it('checks the box when the protocol is RTU over TCP', () => {
    seed({
      connectionConfig: {
        ...useRootZustand.getState().connectionConfig,
        protocol: 'ModbusRtuOverTcp'
      }
    })

    render(<MenuConnectionOptions />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('renders nothing (no checkbox, no divider) for serial RTU', () => {
    seed({
      connectionConfig: { ...useRootZustand.getState().connectionConfig, protocol: 'ModbusRtu' }
    })

    const { container } = render(<MenuConnectionOptions />)

    expect(screen.queryByTestId('rtu-over-tcp-checkbox')).not.toBeInTheDocument()
    expect(container.querySelectorAll('hr')).toHaveLength(0)
  })

  it('toggles the protocol between TCP and RTU-over-TCP via the checkbox', () => {
    seed({
      connectionConfig: { ...useRootZustand.getState().connectionConfig, protocol: 'ModbusTcp' }
    })

    render(<MenuConnectionOptions />)

    fireEvent.click(screen.getByTestId('rtu-over-tcp-checkbox'))
    expect(useRootZustand.getState().connectionConfig.protocol).toBe('ModbusRtuOverTcp')
    expect(window.api.updateConnectionConfig).toHaveBeenCalledWith({ protocol: 'ModbusRtuOverTcp' })

    fireEvent.click(screen.getByTestId('rtu-over-tcp-checkbox'))
    expect(useRootZustand.getState().connectionConfig.protocol).toBe('ModbusTcp')
  })

  it('disables the checkbox while not disconnected', () => {
    seed({
      connectionConfig: { ...useRootZustand.getState().connectionConfig, protocol: 'ModbusTcp' },
      clientState: {
        connectState: 'connected',
        polling: false,
        scanningUniId: false,
        scanningRegisters: false
      }
    } as never)

    render(<MenuConnectionOptions />)

    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
