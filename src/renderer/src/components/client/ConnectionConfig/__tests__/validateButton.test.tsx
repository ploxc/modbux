// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// Validate is a diagnostic and says what it found in a snackbar. It wrote
// `valid.com` as well, and that flag means something narrower: whether main
// was given what the field holds. `validateSerialPort` answers no for any path
// `getPorts()` does not enumerate, and a socat or other virtual pty is
// connectable and never enumerated, so pressing this on one greyed Connect.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useClientZustand, getSelectedSession } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { defaultClientState, defaultConnectionConfig } from '@shared'
import ConnectionConfig from '../ConnectionConfig'
import { patchSelectedClient } from '../../../../context/__tests__/selectedClient'
import { patchShownData } from '../../../../context/__tests__/shownData'

const renderRtu = (): void => {
  patchShownData(useDataZustand, {
    clientState: { ...defaultClientState, connectState: 'disconnected' }
  })
  patchSelectedClient(
    useClientZustand,
    {
      connectionConfig: {
        ...defaultConnectionConfig,
        protocol: 'ModbusRtu',
        rtu: { ...defaultConnectionConfig.rtu, com: '/tmp/ttyV1' }
      }
    },
    { ready: true, valid: { host: true, com: true, length: true } }
  )
  useClientZustand.setState({
    serialPorts: [],
    validateSerialPort: async () => ({ valid: false, message: 'Port not found' })
  } as never)
  render(<ConnectionConfig />)
}

describe('the Validate button', () => {
  it('leaves Connect alone for a port it could not enumerate', async () => {
    renderRtu()

    fireEvent.click(screen.getByTestId('rtu-validate-btn'))

    await waitFor(() => {
      expect(getSelectedSession().valid.com).toBe(true)
    })
    expect(screen.getByTestId('connect-btn')).toBeEnabled()
  })
})
