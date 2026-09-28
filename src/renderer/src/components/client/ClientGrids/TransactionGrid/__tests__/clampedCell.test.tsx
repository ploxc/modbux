// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// A request or a response shows one line and a `more` where something is
// hidden; `more` opens the row in full, and `less` closes it.
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ClampedCell from '../ClampedCell'

const cell = (more: boolean): void => {
  render(
    <ClampedCell
      id="t1"
      field="response"
      line="1: 01 03"
      full={
        <>
          <span>1: 01 03</span>
          <span>2: 01 04</span>
        </>
      }
      more={more}
    />
  )
}

describe('ClampedCell', () => {
  it('opens the row on more, shows it all, and closes it on less', () => {
    cell(true)
    expect(screen.queryByText('2: 01 04')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('transaction-response-more-t1'))
    expect(screen.getByText('2: 01 04')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('transaction-response-less-t1'))
    expect(screen.queryByText('2: 01 04')).not.toBeInTheDocument()
  })

  it('offers no more where the line is all there is and it fits', () => {
    cell(false)
    expect(screen.getByText('1: 01 03')).toBeInTheDocument()
    expect(screen.queryByTestId('transaction-response-more-t1')).not.toBeInTheDocument()
  })
})
