// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// `Object.keys(servers)` in a selector allocates a new array every time it
// runs, and zustand compares a selector's answer with `Object.is`. React reads
// the selector again on the render that follows, finds another new array and
// renders again: rendering this threw "Maximum update depth exceeded".
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MAIN_SERVER_UUID } from '@shared'

vi.mock('notistack', () => ({
  useSnackbar: (): { enqueueSnackbar: () => void } => ({ enqueueSnackbar: vi.fn() }),
  enqueueSnackbar: vi.fn()
}))

import { stubRenderer } from '@renderer/context/__tests__/stubRenderer'

stubRenderer()

const { useServerZustand } = await import('@renderer/context/server.zustand')
const { getDefaultServer } = await import('@renderer/context/server.zustand.helpers')
const SelectServer = (await import('../SelectServer')).default

const SECOND_UUID = 'the-server-on-503'

beforeEach(() => {
  useServerZustand.setState({
    selectedUuid: MAIN_SERVER_UUID,
    ready: { [MAIN_SERVER_UUID]: true, [SECOND_UUID]: true },
    serverMode: 'tcp',
    servers: {
      [MAIN_SERVER_UUID]: { ...getDefaultServer(), port: '502' },
      [SECOND_UUID]: { ...getDefaultServer(), port: '503' }
    }
  })
})

describe('the server toggle group', () => {
  it('draws one toggle per server, labelled with its port', () => {
    render(<SelectServer />)

    expect(screen.getByTestId('select-server-502')).toBeInTheDocument()
    expect(screen.getByTestId('select-server-503')).toBeInTheDocument()
  })

  it('stands through a write to a field it does not read', () => {
    render(<SelectServer />)

    act(() => {
      useServerZustand.getState().setName('a name the toggles do not draw')
    })

    expect(screen.getByTestId('select-server-502')).toBeInTheDocument()
  })

  it('draws no toggle for a record holding no server', () => {
    useServerZustand.setState({ servers: {} })

    render(<SelectServer />)

    expect(screen.queryByTestId(/^select-server-/)).toBeNull()
  })
})
