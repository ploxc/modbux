import { Conversion } from '@shared'
import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react'
import { Draft, DraftKind, isLerpKey, isNumber, problemOf, STARTS } from './draft'

interface ConversionDraft {
  draft: Draft
  factorText: string
  problem: string | undefined
  pick: (kind: DraftKind) => void
  handleFactor: (event: ChangeEvent<HTMLInputElement>) => void
  handleLerp: (event: ChangeEvent<HTMLInputElement>) => void
  handleCode: (code: string) => void
  /** The draft as it stands, read at the moment of a save. */
  current: () => Draft
}

/**
 * The conversion the dialog edits, started from the register's, and why it
 * cannot be saved. Every handler keeps its identity, so a part of the dialog
 * that takes one renders again only for what it shows.
 */
export const useConversionDraft = (initial: Conversion | undefined): ConversionDraft => {
  const [draft, setDraft] = useState<Draft>(initial)
  const [factorText, setFactorText] = useState(
    initial?.kind === 'scale' ? String(initial.factor) : '1'
  )
  const problem = useMemo(() => problemOf(draft, factorText), [draft, factorText])
  const latest = useRef(draft)
  latest.current = draft

  const pick = useCallback((kind: DraftKind) => {
    setDraft((draft) => (kind === 'none' ? undefined : draft?.kind === kind ? draft : STARTS[kind]))
  }, [])
  const handleFactor = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    setFactorText(text)
    if (isNumber(text)) setDraft({ kind: 'scale', factor: Number(text) })
  }, [])
  const handleLerp = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setDraft((draft) =>
      draft?.kind === 'lerp' && isLerpKey(name) ? { ...draft, [name]: value } : draft
    )
  }, [])
  const handleCode = useCallback((code: string) => setDraft({ kind: 'script', code }), [])
  const current = useCallback(() => latest.current, [])

  return { draft, factorText, problem, pick, handleFactor, handleLerp, handleCode, current }
}
