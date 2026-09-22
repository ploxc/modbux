// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// `setHost` and `setCom` keep a value the schema refuses in the store without
// sending it, so the field shows what was typed and main holds the value
// before it. The button disabled on `disconnecting` alone, so a press on a
// half typed host connected to the previous one and the app reported connected
// over a field saying otherwise.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { render, screen } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { ClientState, defaultClientState, defaultConnectionConfig, Protocol } from '@shared'
import ConnectionConfig from '../ConnectionConfig'

const renderButton = ({
  connectState = 'disconnected',
  protocol = 'ModbusTcp',
  host = true,
  com = true
}: {
  connectState?: ClientState['connectState']
  protocol?: Protocol
  host?: boolean
  com?: boolean
}): HTMLElement => {
  useClientZustand.setState({
    ready: true,
    connectionConfig: { ...defaultConnectionConfig, protocol },
    valid: { host, com, length: true }
  } as never)
  useDataZustand.setState({ clientState: { ...defaultClientState, connectState } })
  render(<ConnectionConfig />)
  return screen.getByTestId('connect-btn')
}

describe('the Connect button', () => {
  it('takes a press on a host the boundary took', () => {
    expect(renderButton({})).toBeEnabled()
  })

  it('takes none on a host main was never given', () => {
    expect(renderButton({ host: false })).toBeDisabled()
  })

  // The COM port is the RTU field, and the host is not asked about there.
  it('takes none on a COM port main was never given', () => {
    expect(renderButton({ protocol: 'ModbusRtu', com: false })).toBeDisabled()
  })

  it('takes a press on RTU while the host is invalid', () => {
    expect(renderButton({ protocol: 'ModbusRtu', host: false })).toBeEnabled()
  })

  it('takes a press on TCP while the COM port is invalid', () => {
    expect(renderButton({ com: false })).toBeEnabled()
  })

  // Disconnect and the cancel a connecting state draws go through this same
  // button, and a field nobody can edit while connected must not stop either.
  it.each(['connected', 'connecting'] as const)(
    'takes a press in %s whatever the field holds',
    (connectState) => {
      expect(renderButton({ connectState, host: false })).toBeEnabled()
    }
  )

  it('takes none while disconnecting', () => {
    expect(renderButton({ connectState: 'disconnecting' })).toBeDisabled()
  })
})
