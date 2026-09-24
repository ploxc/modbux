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
import { useClientZustand } from '@renderer/context/client.zustand'
import { ClientState, defaultClientState, emptyRegisterMapping } from '@shared'
import PollButton from '../PollButton'
import { patchShownData } from '../../../../../../context/__tests__/shownData'
import { patchSelectedClient } from '../../../../../../context/__tests__/selectedClient'

interface Toolbar {
  /** What the Length field's validity flag reads. */
  lengthGiven?: boolean
  /** Read configuration on, with a group for the register type or without. */
  mappedGroup?: boolean
}

const renderButton = (
  clientState: Partial<ClientState>,
  { lengthGiven = true, mappedGroup }: Toolbar = {}
): HTMLElement => {
  patchShownData(useDataZustand, {
    clientState: { ...defaultClientState, connectState: 'connected', ...clientState }
  })
  const registerMapping = emptyRegisterMapping()
  if (mappedGroup) registerMapping.holding_registers = { 0: { dataType: 'uint16' } }
  patchSelectedClient(
    useClientZustand,
    { registerMapping },
    {
      readConfiguration: mappedGroup !== undefined,
      valid: { host: true, com: true, length: lengthGiven }
    }
  )
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

  // A poll goes on through a reconnect, so the press that stops it does too.
  it('takes the press that stops a poll while the connection reconnects', () => {
    expect(renderButton({ connectState: 'connecting', polling: true })).toBeEnabled()
  })

  it('takes the press that stops a poll while the client disconnects', () => {
    expect(renderButton({ connectState: 'disconnecting', polling: true })).toBeEnabled()
  })

  it('takes no press that starts one while the connection reconnects', () => {
    expect(renderButton({ connectState: 'connecting' })).toBeDisabled()
  })

  // Main refuses a poll of no registers, which is the toolbar's block at a
  // length the field refused and kept.
  it('takes no press that starts one at a length the field refused', () => {
    expect(renderButton({}, { lengthGiven: false })).toBeDisabled()
  })

  it('takes the press that stops a poll at that length', () => {
    expect(renderButton({ polling: true }, { lengthGiven: false })).toBeEnabled()
  })

  it('takes a press at that length when read configuration reads its groups', () => {
    expect(renderButton({}, { lengthGiven: false, mappedGroup: true })).toBeEnabled()
  })

  it('takes none at that length when read configuration has no group for the type', () => {
    expect(renderButton({}, { lengthGiven: false, mappedGroup: false })).toBeDisabled()
  })
})
