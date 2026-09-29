// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// The switch says whether a poll reads the register type on screen, and hands
// that to main with the unit it belongs to.
import { describe, it, expect, vi } from 'vitest'

// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { getSelectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import SectionPollSwitch from '../SectionPollSwitch'
import { patchSelectedClient } from '@renderer/context/__tests__/selectedClient'
import { patchShownData } from '@renderer/context/__tests__/shownData'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { defaultClientState } from '@shared'

describe('the section poll switch', () => {
  it('puts the coils of the unit on screen in the poll', async () => {
    patchSelectedClient(useClientZustand, {}, { shownType: 'coils' })
    render(<SectionPollSwitch />)

    fireEvent.click(within(screen.getByTestId('section-poll-switch')).getByRole('switch'))

    await waitFor(() => expect(getSelectedUnit().sections.coils.polled).toBe(true))
    expect(getSelectedUnit().sections.holding_registers.polled).toBe(true)
  })

  // A poll under read configuration reads the groups of the polled types, as
  // Monitor's does, so the switch counts there too.
  it('takes a press under read configuration', () => {
    const unit = getSelectedUnit().uuid
    patchSelectedClient(useClientZustand, {}, { readConfiguration: { [unit]: true } })
    render(<SectionPollSwitch />)

    expect(within(screen.getByTestId('section-poll-switch')).getByRole('switch')).toBeEnabled()
  })

  // Monitor polls while logging is on, whatever this switch says.
  it('takes no press while logging is on', () => {
    patchShownData(useLiveZustand, {
      clientState: { ...defaultClientState, log: { ...defaultClientState.log, enabled: true } }
    })
    render(<SectionPollSwitch />)

    expect(within(screen.getByTestId('section-poll-switch')).getByRole('switch')).toBeDisabled()
    patchShownData(useLiveZustand, { clientState: defaultClientState })
  })
})
