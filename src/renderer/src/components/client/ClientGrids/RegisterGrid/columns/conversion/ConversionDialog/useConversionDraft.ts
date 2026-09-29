import { Conversion, DataType } from '@shared'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Draft, DraftKind, isNumber, LerpKey, problemOf, STARTS } from './draft'

interface ConversionDraft {
  draft: Draft
  factorText: string
  problem: string | undefined
  pick: (kind: DraftKind) => void
  handleFactor: (text: string) => void
  handleLerp: (key: LerpKey, text: string) => void
  handleCode: (code: string) => void
  /** The draft as it stands, read at the moment of a save. */
  current: () => Draft
}

/**
 * The conversion the dialog edits, started from the register's, and why it
 * cannot be saved. Every handler keeps its identity, so a part of the dialog
 * that takes one renders again only for what it shows.
 */
export const useConversionDraft = (
  initial: Conversion | undefined,
  dataType: DataType | undefined
): ConversionDraft => {
  const [draft, setDraft] = useState<Draft>(initial)
  const [factorText, setFactorText] = useState(
    initial?.kind === 'scale' ? String(initial.factor) : '1'
  )
  const problem = useMemo(
    () => problemOf(draft, factorText, dataType),
    [draft, factorText, dataType]
  )
  const latest = useRef(draft)
  latest.current = draft

  const pick = useCallback((kind: DraftKind) => {
    setDraft((draft) => (kind === 'none' ? undefined : draft?.kind === kind ? draft : STARTS[kind]))
  }, [])
  const handleFactor = useCallback((text: string) => {
    setFactorText(text)
    if (isNumber(text)) setDraft({ kind: 'scale', factor: Number(text) })
  }, [])
  const handleLerp = useCallback((key: LerpKey, text: string) => {
    setDraft((draft) => (draft?.kind === 'lerp' ? { ...draft, [key]: text } : draft))
  }, [])
  const handleCode = useCallback((code: string) => setDraft({ kind: 'script', code }), [])
  const current = useCallback(() => latest.current, [])

  return { draft, factorText, problem, pick, handleFactor, handleLerp, handleCode, current }
}
