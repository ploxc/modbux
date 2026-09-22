// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// Pressing it starts a poll or stops the one that runs. Main refuses a start
// while anything else owns the client, and this button disabled on the connect
// state alone, so every refusal reached the user as a warning for a press the
// button had taken.
import { describe, it, expect, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { render, screen } from '@testing-library/react'
import { useDataZustand } from '@renderer/context/data.zustand'
import { ClientState, defaultClientState } from '@shared'
import PollButton from '../PollButton'

const renderButton = (clientState: Partial<ClientState>): HTMLElement => {
  useDataZustand.setState({
    clientState: { ...defaultClientState, connectState: 'connected', ...clientState }
  })
  render(<PollButton />)
  return screen.getByTestId('poll-btn')
}

describe('the Poll button', () => {
  it('takes a press while the client is idle', () => {
    expect(renderButton({})).toBeEnabled()
  })

  // The press that stops one. `exceptPolling` is what keeps it: nothing else
  // can own the client during a poll, so the button stays live to be pressed
  // again.
  it('takes a press while a poll runs', () => {
    expect(renderButton({ polling: true })).toBeEnabled()
  })

  it('takes none while a read is in flight', () => {
    expect(renderButton({ reading: true })).toBeDisabled()
  })

  it('takes none while a write is in flight', () => {
    expect(renderButton({ writing: true })).toBeDisabled()
  })

  it('takes none while a register scan runs', () => {
    expect(renderButton({ scanningRegisters: true })).toBeDisabled()
  })

  it('takes none while a unit id scan runs', () => {
    expect(renderButton({ scanningUnitIds: true })).toBeDisabled()
  })

  it('takes none while nothing is connected', () => {
    expect(renderButton({ connectState: 'disconnected' })).toBeDisabled()
  })
})
