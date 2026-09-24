// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The split out window asks main which servers it holds, so it may only open
// once this window has opened every server.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from '@renderer/context/__tests__/stubRenderer'

const serverState = { initialized: false }

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

beforeEach(() => {
  vi.resetModules()
  stubRenderer()
})

const renderHome = async (initialized: boolean): Promise<HTMLElement> => {
  serverState.initialized = initialized
  const { default: Home } = await import('../Home')
  render(<Home />)
  return screen.getByTestId('home-split-btn')
}

describe('the split button', () => {
  it('waits while this window is still opening its servers', async () => {
    expect(await renderHome(false)).toBeDisabled()
  })

  it('opens once every server is open', async () => {
    expect(await renderHome(true)).toBeEnabled()
  })
})
