// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The draft the dialog edits, and the factor field that shows its scale.
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScaleField } from '../KindFields'
import { useConversionDraft } from '../useConversionDraft'

let draft: ReturnType<typeof useConversionDraft> | undefined

const Harness = (): JSX.Element => {
  draft = useConversionDraft({ kind: 'scale', factor: 0.1 }, 'int16')
  return draft.draft?.kind === 'scale' ? (
    <ScaleField factorText={draft.factorText} set={draft.handleFactor} />
  ) : (
    <></>
  )
}

const pick = (kind: 'none' | 'scale'): void => act(() => draft?.pick(kind))

describe('Scale picked again after another kind', () => {
  it('shows the factor it will save', () => {
    render(<Harness />)
    pick('none')
    pick('scale')

    const saved = draft?.current()
    const factor = saved?.kind === 'scale' ? saved.factor : undefined
    expect(screen.getByTestId('conversion-factor-input')).toHaveValue(String(factor))
  })
})
