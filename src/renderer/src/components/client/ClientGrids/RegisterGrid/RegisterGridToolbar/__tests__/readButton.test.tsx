// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// Pressing it asks main for a read, and main refuses one while anything else
// owns the client. The button says so by going dead, rather than taking a press
// that answers with a warning.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { render, screen } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { ClientState, defaultClientState } from '@shared'
import ReadButton from '../ReadButton'

const renderButton = (clientState: Partial<ClientState>): HTMLElement => {
  useClientZustand.setState({
    clientState: { ...defaultClientState, connectState: 'connected', ...clientState }
  } as never)
  render(<ReadButton />)
  return screen.getByTestId('read-btn')
}

describe('the Read button', () => {
  it('takes a press while the client is idle', () => {
    expect(renderButton({})).toBeEnabled()
  })

  it('takes none while a read is in flight', () => {
    expect(renderButton({ reading: true })).toBeDisabled()
  })

  // A write holds the client from its own request to the end of the read back,
  // and `reading` covers the second half of that stretch alone.
  it('takes none while a write is in flight', () => {
    expect(renderButton({ writing: true })).toBeDisabled()
  })

  it('takes none while a poll runs', () => {
    expect(renderButton({ polling: true })).toBeDisabled()
  })

  it('takes none while nothing is connected', () => {
    expect(renderButton({ connectState: 'disconnected' })).toBeDisabled()
  })
})
