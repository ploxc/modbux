import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import InputBase from '@mui/material/InputBase'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import { alpha } from '@mui/material/styles'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { meme } from '@renderer/components/shared/inputs/meme'
import { scriptError } from '@renderer/conversion/scriptEngine'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { Conversion, ConversionKind, DataType, DEFAULT_SCRIPT } from '@shared'
import { ChangeEvent, useCallback, useMemo, useState } from 'react'
import { useRowAt } from '../../useRowAt'
import ScriptEditor from './ScriptEditor'
import { applyConversion } from '../convertedValue'
import { wordOf } from '@shared'

const KINDS: { kind: ConversionKind | 'none'; label: string }[] = [
  { kind: 'none', label: 'None' },
  { kind: 'scale', label: 'Scale' },
  { kind: 'lerp', label: 'Linear interpolation' },
  { kind: 'script', label: 'Custom' }
]

/** What each kind starts from when it is picked. */
const STARTS: Record<ConversionKind, Conversion> = {
  scale: { kind: 'scale', factor: 1 },
  lerp: { kind: 'lerp', x1: '0', x2: '1', y1: '0', y2: '1' },
  script: { kind: 'script', code: DEFAULT_SCRIPT }
}

type Draft = Conversion | undefined

/** Whether a field of the scale or the interpolation holds a number. */
const isNumber = (text: string): boolean => text.trim() !== '' && Number.isFinite(Number(text))

/** Why the draft cannot be saved, or undefined when it can. */
const problemOf = (draft: Draft, factorText: string): string | undefined => {
  if (draft === undefined) return undefined
  if (draft.kind === 'scale') return isNumber(factorText) ? undefined : 'The factor is no number'
  if (draft.kind === 'lerp') {
    const fields = [draft.x1, draft.x2, draft.y1, draft.y2]
    return fields.every(isNumber) ? undefined : 'Every field takes a number'
  }
  const error = scriptError(draft.code)
  return error && `${error.line === undefined ? '' : `Line ${error.line}: `}${error.message}`
}

interface PreviewProps {
  draft: Draft
  dataType: DataType | undefined
  address: number
}

/** What the draft makes of a value typed in, and of the last read. */
const Preview = meme(({ draft, dataType, address }: PreviewProps) => {
  const [test, setTest] = useState('')
  const row = useRowAt(address)
  const read = row && wordOf(row.words, dataType)
  const readText = read === undefined || read === '' ? undefined : String(read)

  // A draft that does not convert shows a dash here; why is said at the code.
  const resultOf = (value: string): string => {
    if (!isNumber(value)) return ''
    const result = applyConversion(value, dataType, draft)
    return typeof result === 'number' ? String(result) : '—'
  }
  const handleTest = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTest(event.target.value)
  }, [])

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '96px 16px minmax(0, 1fr)',
        alignItems: 'center',
        columnGap: 1,
        rowGap: 0.75,
        fontFamily: 'monospace',
        fontSize: 12.5
      }}
    >
      <InputBase
        value={test}
        onChange={handleTest}
        placeholder="raw"
        inputProps={{ 'data-testid': 'conversion-test-input', 'aria-label': 'A raw value to try' }}
        sx={(theme) => ({
          height: 26,
          px: 1,
          fontSize: 'inherit',
          fontFamily: 'inherit',
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: '4px'
        })}
      />
      <Box sx={{ color: 'text.disabled' }}>→</Box>
      <Box data-testid="conversion-test-result" sx={{ color: 'primary.light' }}>
        {resultOf(test)}
      </Box>
      {readText !== undefined && (
        <>
          <Box sx={{ pl: '9px', color: 'text.secondary' }}>{readText}</Box>
          <Box sx={{ color: 'text.disabled' }}>→</Box>
          <Box sx={{ color: 'primary.light' }}>
            {resultOf(readText)}
            <Box component="span" sx={{ ml: 1, fontFamily: 'Roboto', color: 'text.disabled' }}>
              the last read
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
})

interface ConversionDialogProps {
  address: number
  anchor: HTMLElement | null
  onClose: () => void
}

/**
 * The conversion of one register: None, a Scale, a Linear interpolation or a
 * Custom script, with what it makes of a value while it is edited. Save
 * writes it to the mapping; closing it any other way keeps what was there.
 */
const ConversionDialog = meme(({ address, anchor, onClose }: ConversionDialogProps) => {
  const type = useSectionType()
  const entry = useClientZustand((z) => selectedUnit(z).registerMapping[type][address])
  const [draft, setDraft] = useState<Draft>(entry?.conversion)
  const [factorText, setFactorText] = useState(
    entry?.conversion?.kind === 'scale' ? String(entry.conversion.factor) : '1'
  )
  const problem = useMemo(() => problemOf(draft, factorText), [draft, factorText])

  const pick = useCallback((kind: ConversionKind | 'none') => {
    setDraft((current) =>
      kind === 'none' ? undefined : current?.kind === kind ? current : STARTS[kind]
    )
  }, [])
  const handleFactor = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    setFactorText(text)
    if (isNumber(text)) setDraft({ kind: 'scale', factor: Number(text) })
  }, [])
  const handleLerp = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const key = event.target.name
    const value = event.target.value
    setDraft((current) =>
      current?.kind === 'lerp' && (key === 'x1' || key === 'x2' || key === 'y1' || key === 'y2')
        ? { ...current, [key]: value }
        : current
    )
  }, [])
  const handleCode = useCallback((code: string) => {
    setDraft({ kind: 'script', code })
  }, [])
  const handleSave = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setRegisterMapping(address, 'conversion', draft)
    onClose()
  }, [address, draft, onClose])

  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { p: 0, width: 640 } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5 }}>
        <Box sx={{ fontSize: 15, fontWeight: 500 }}>Conversion</Box>
        <Box sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary' }}>
          {address}
          {entry?.dataType ? ` · ${entry.dataType.toUpperCase()}` : ''}
          {entry?.comment ? ` · ${entry.comment}` : ''}
        </Box>
      </Box>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: '170px minmax(0, 1fr)',
          minHeight: 200,
          borderTop: `1px solid ${theme.palette.divider}`,
          borderBottom: `1px solid ${theme.palette.divider}`
        })}
      >
        <Box
          sx={(theme) => ({
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
            p: 1,
            borderRight: `1px solid ${theme.palette.divider}`
          })}
        >
          {KINDS.map(({ kind, label }) => (
            <KindButton
              key={kind}
              kind={kind}
              label={label}
              active={(draft?.kind ?? 'none') === kind}
              onPick={pick}
            />
          ))}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {draft === undefined && (
            <Box sx={{ p: 2, fontSize: 13, color: 'text.secondary' }}>
              The value as its data type reads it.
            </Box>
          )}
          {draft?.kind === 'scale' && (
            <Box sx={{ p: 2 }}>
              <TextField
                label="Factor"
                size="small"
                value={factorText}
                onChange={handleFactor}
                error={!isNumber(factorText)}
                slotProps={{ htmlInput: { 'data-testid': 'conversion-factor-input' } }}
                sx={{ width: 140 }}
              />
            </Box>
          )}
          {draft?.kind === 'lerp' && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 1.25,
                p: 2,
                alignContent: 'start'
              }}
            >
              {(
                [
                  ['x1', 'Raw from'],
                  ['x2', 'Raw to'],
                  ['y1', 'Value from'],
                  ['y2', 'Value to']
                ] as const
              ).map(([key, label]) => (
                <TextField
                  key={key}
                  name={key}
                  label={label}
                  size="small"
                  value={draft[key]}
                  onChange={handleLerp}
                  error={!isNumber(draft[key])}
                  slotProps={{ htmlInput: { 'data-testid': `conversion-${key}-input` } }}
                />
              ))}
            </Box>
          )}
          {draft?.kind === 'script' && (
            <>
              <ScriptEditor code={draft.code} onChange={handleCode} />
              {problem && (
                <Box
                  data-testid="conversion-script-status"
                  sx={(theme) => ({
                    px: 1.5,
                    py: 0.75,
                    fontSize: 11.5,
                    borderTop: `1px solid ${theme.palette.divider}`,
                    color: 'error.main'
                  })}
                >
                  {problem}
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: 2, py: 1.5 }}>
        <Box sx={{ fontSize: 11, color: 'text.disabled' }}>Preview</Box>
        <Preview draft={draft} dataType={entry?.dataType} address={address} />
      </Box>
      <Box
        sx={(theme) => ({
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          px: 2,
          py: 1.25,
          borderTop: `1px solid ${theme.palette.divider}`
        })}
      >
        <Button
          data-testid="conversion-cancel-btn"
          variant="text"
          color="inherit"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          data-testid="conversion-save-btn"
          variant="outlined"
          disabled={problem !== undefined}
          onClick={handleSave}
        >
          Save
        </Button>
      </Box>
    </Popover>
  )
})

interface KindButtonProps {
  kind: ConversionKind | 'none'
  label: string
  active: boolean
  onPick: (kind: ConversionKind | 'none') => void
}

const KindButton = meme(({ kind, label, active, onPick }: KindButtonProps) => {
  const handleClick = useCallback(() => onPick(kind), [kind, onPick])
  return (
    <ButtonBase
      data-testid={`conversion-kind-${kind}-btn`}
      aria-pressed={active}
      onClick={handleClick}
      sx={(theme) => ({
        justifyContent: 'flex-start',
        height: 28,
        px: 1,
        borderRadius: '4px',
        fontSize: 13,
        color: active ? 'primary.light' : 'text.primary',
        background: active ? alpha(theme.palette.primary.main, 0.16) : 'transparent'
      })}
    >
      {label}
    </ButtonBase>
  )
})

export default ConversionDialog
