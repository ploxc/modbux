import Box from '@mui/material/Box'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { useCallback, useState } from 'react'
import DialogActions from './DialogActions'
import DialogTitle from './DialogTitle'
import { LerpFields, NoneNote, ScaleField } from './KindFields'
import KindList from './KindList'
import Preview from './Preview'
import ScriptPanel from './ScriptPanel'
import { useConversionDraft } from './useConversionDraft'

interface ConversionFormProps {
  address: number
  onClose: () => void
}

/**
 * What the dialog holds: the draft and every part that shows it. It renders
 * inside the popover, so a keystroke renders this and not the popover.
 */
const ConversionForm = meme(({ address, onClose }: ConversionFormProps) => {
  const type = useSectionType()
  const dataType = useClientZustand((z) => selectedUnit(z).registerMapping[type][address]?.dataType)
  const comment = useClientZustand((z) => selectedUnit(z).registerMapping[type][address]?.comment)
  // Read once: the dialog edits a copy, and Save writes it back.
  const [initial] = useState(
    () => selectedUnit(useClientZustand.getState()).registerMapping[type][address]?.conversion
  )
  const { draft, factorText, problem, pick, handleFactor, handleLerp, handleCode, current } =
    useConversionDraft(initial, dataType)

  const handleSave = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setRegisterMapping(address, 'conversion', current())
    onClose()
  }, [address, current, onClose])

  const subject = [String(address), dataType?.toUpperCase(), comment].filter(Boolean).join(' · ')

  return (
    <>
      <DialogTitle subject={subject} onClose={onClose} />
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: '170px minmax(0, 1fr)',
          minHeight: 200,
          flexGrow: 1,
          borderTop: `1px solid ${theme.palette.divider}`,
          borderBottom: `1px solid ${theme.palette.divider}`
        })}
      >
        <KindList active={draft?.kind ?? 'none'} onPick={pick} />
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {draft === undefined && <NoneNote />}
          {draft?.kind === 'scale' && <ScaleField factorText={factorText} set={handleFactor} />}
          {draft?.kind === 'lerp' && (
            <LerpFields
              dataType={dataType}
              x1={draft.x1}
              x2={draft.x2}
              y1={draft.y1}
              y2={draft.y2}
              set={handleLerp}
            />
          )}
          {draft?.kind === 'script' && (
            <ScriptPanel code={draft.code} problem={problem} onChange={handleCode} />
          )}
        </Box>
      </Box>
      <Preview draft={draft} dataType={dataType} address={address} />
      <DialogActions canSave={problem === undefined} onCancel={onClose} onSave={handleSave} />
    </>
  )
})

export default ConversionForm
