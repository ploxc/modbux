// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import ServerBit, { ServerBitProps } from '../ServerBit'

const renderBit = (props: Partial<ServerBitProps> = {}): void => {
  render(
    <ServerBit
      bitIndex={3}
      active={false}
      comment={undefined}
      onToggle={vi.fn()}
      onCommentChange={vi.fn()}
      {...props}
    />
  )
}

describe('the toggle circle', () => {
  it('carries a bit that is on', () => {
    renderBit({ active: true })
    expect(screen.getByTestId('server-bit-circle-3')).toHaveAttribute('data-active', 'true')
  })

  it('carries a bit that is off', () => {
    renderBit({ active: false })
    expect(screen.getByTestId('server-bit-circle-3')).toHaveAttribute('data-active', 'false')
  })

  it('toggles on click', async () => {
    const onToggle = vi.fn()
    renderBit({ onToggle })

    await userEvent.click(screen.getByTestId('server-bit-circle-3'))

    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not toggle when the row is read only', async () => {
    const onToggle = vi.fn()
    renderBit({ onToggle, readOnly: true })

    await userEvent.click(screen.getByTestId('server-bit-circle-3'))

    expect(onToggle).not.toHaveBeenCalled()
  })
})

describe('the comment', () => {
  it('is editable by clicking what is shown', async () => {
    const onCommentChange = vi.fn()
    renderBit({ comment: 'run', onCommentChange })

    await userEvent.click(screen.getByTestId('server-bit-comment-3'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'motor running{Enter}')

    expect(onCommentChange).toHaveBeenCalledWith('motor running')
  })

  it('is not editable when the row is read only', async () => {
    const onCommentChange = vi.fn()
    renderBit({ comment: 'run', onCommentChange, readOnly: true })

    await userEvent.click(screen.getByTestId('server-bit-comment-3'))

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
