import DraggablePopover from '@renderer/components/shared/DraggablePopover/DraggablePopover'
import { meme } from '@renderer/components/shared/inputs/meme'
import ConversionForm from './ConversionForm'

interface ConversionDialogProps {
  address: number
  anchor: HTMLElement | null
  onClose: () => void
}

/** Resizable from its corner, the script editor taking the room it gains. */
const PAPER_SX = {
  p: 0,
  width: 640,
  minWidth: 560,
  minHeight: 420,
  resize: 'both',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column'
} as const

/**
 * The conversion of one register: None, a Scale, a Linear interpolation or a
 * Custom script, with what it makes of a value while it is edited. Save
 * writes it to the mapping; closing it any other way keeps what was there.
 */
const ConversionDialog = meme(({ address, anchor, onClose }: ConversionDialogProps) => (
  <DraggablePopover anchor={anchor} onClose={onClose} paperSx={PAPER_SX}>
    <ConversionForm address={address} onClose={onClose} />
  </DraggablePopover>
))

export default ConversionDialog
