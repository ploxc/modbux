import { scriptError } from '@renderer/conversion/scriptEngine'
import { Conversion, ConversionKind, DataType, DEFAULT_SCRIPT, getMinMaxValues } from '@shared'

/** A conversion being edited, or none. */
export type Draft = Conversion | undefined

/** The four kinds the dialog offers, `none` among them. */
export type DraftKind = ConversionKind | 'none'

export const KINDS: { kind: DraftKind; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'scale', label: 'Scale' },
  { kind: 'lerp', label: 'Linear interpolation' },
  { kind: 'script', label: 'Custom' }
]

/** What each kind starts from when it is picked. */
export const STARTS: Record<ConversionKind, Conversion> = {
  scale: { kind: 'scale', factor: 1 },
  lerp: { kind: 'lerp', x1: '0', x2: '1', y1: '0', y2: '1' },
  script: { kind: 'script', code: DEFAULT_SCRIPT }
}

/** The four fields of a linear interpolation, with their labels. */
export const LERP_FIELDS = [
  ['x1', 'Raw from'],
  ['x2', 'Raw to'],
  ['y1', 'Value from'],
  ['y2', 'Value to']
] as const

export type LerpKey = (typeof LERP_FIELDS)[number][0]

/** Whether a field of the scale or the interpolation holds a number. */
export const isNumber = (text: string): boolean =>
  text.trim() !== '' && Number.isFinite(Number(text))

/** Whether a raw value lies outside what `dataType` can read. */
export const outsideRaw = (text: string, dataType: DataType | undefined): boolean => {
  if (dataType === undefined || !isNumber(text)) return false
  const { min, max } = getMinMaxValues(dataType)
  const value = Number(text)
  return value < min || value > max
}

/** Why the draft cannot be saved, or undefined when it can. */
export const problemOf = (
  draft: Draft,
  factorText: string,
  dataType: DataType | undefined
): string | undefined => {
  if (draft === undefined) return undefined
  if (draft.kind === 'scale') return isNumber(factorText) ? undefined : 'The factor is no number'
  if (draft.kind === 'lerp') {
    const fields = [draft.x1, draft.x2, draft.y1, draft.y2]
    if (!fields.every(isNumber)) return 'Every field takes a number'
    return [draft.x1, draft.x2].some((raw) => outsideRaw(raw, dataType))
      ? 'A raw point lies outside the data type'
      : undefined
  }
  const error = scriptError(draft.code)
  return error && `${error.line === undefined ? '' : `Line ${error.line}: `}${error.message}`
}
