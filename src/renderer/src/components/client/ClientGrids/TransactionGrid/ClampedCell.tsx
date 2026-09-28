import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useTransactionGridZustand } from './transactionGrid.zustand'

interface ClampedCellProps {
  /** The transaction, whose row opens and closes as one. */
  id: string
  field: string
  /** What the cell shows on one line. */
  line: ReactNode
  /** What it shows opened, the line when that is all there is. */
  full: ReactNode
  /** Whether the full content holds more than the line, whatever the width. */
  more: boolean
}

/**
 * One line cut with an ellipsis and a `more` that opens the row, or the full
 * content and a `less` that closes it. `more` shows only where something is
 * hidden: a line wider than the cell, or content beyond the line.
 */
const ClampedCell = meme(({ id, field, line, full, more }: ClampedCellProps) => {
  const expanded = useTransactionGridZustand((z) => z.expanded[id] ?? false)
  const lineRef = useRef<HTMLDivElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const element = lineRef.current
    if (!element) return
    const observer = new ResizeObserver(() =>
      setOverflowing(element.scrollWidth > element.clientWidth)
    )
    observer.observe(element)
    return (): void => observer.disconnect()
  }, [expanded])

  const handleToggle = useCallback(() => {
    const transactionGridZustand = useTransactionGridZustand.getState()
    transactionGridZustand.toggleExpanded(id)
  }, [id])

  const toggle = (label: string): JSX.Element => (
    <ButtonBase
      data-testid={`transaction-${field}-${label}-${id}`}
      onClick={handleToggle}
      sx={{ flexShrink: 0, fontSize: 12, color: 'primary.main', fontFamily: 'inherit' }}
    >
      {label}
    </ButtonBase>
  )

  if (expanded)
    return (
      <Box sx={{ width: '100%', py: 0.5, wordBreak: 'break-all' }}>
        {full}
        {toggle('less')}
      </Box>
    )

  return (
    <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Box
        ref={lineRef}
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {line}
      </Box>
      {(overflowing || more) && toggle('more')}
    </Box>
  )
})

export default ClampedCell
