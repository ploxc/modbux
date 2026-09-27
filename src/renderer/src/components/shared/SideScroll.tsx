import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ReactNode, useCallback, useEffect, useRef, useState, WheelEvent } from 'react'

/** How wide the fade is at an edge with more beyond it. */
const FADE = 24

/** Which edges have content beyond them. */
interface Beyond {
  start: boolean
  end: boolean
}

const maskOf = ({ start, end }: Beyond): string | undefined => {
  if (!start && !end) return undefined
  const left = start ? `transparent 0, black ${FADE}px` : 'black 0'
  const right = end ? `black calc(100% - ${FADE}px), transparent 100%` : 'black 100%'
  return `linear-gradient(to right, ${left}, ${right})`
}

/**
 * A row that never wraps: what does not fit scrolls sideways, with the
 * scrollbar hidden and the edge faded where more sits beyond it. The wheel
 * scrolls it too.
 */
const SideScroll = meme(({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [beyond, setBeyond] = useState<Beyond>({ start: false, end: false })

  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    const start = element.scrollLeft > 0
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1
    setBeyond((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end }
    )
  }, [])

  // The row's own width and its content's both change what fits.
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of Array.from(element.children)) observer.observe(child)
    return (): void => observer.disconnect()
  }, [measure, children])

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return
    event.currentTarget.scrollLeft += event.deltaY
  }, [])

  return (
    <Box
      ref={ref}
      onScroll={measure}
      onWheel={handleWheel}
      sx={{
        display: 'flex',
        alignItems: 'stretch',
        minWidth: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        '& > *': { flexShrink: 0 },
        maskImage: maskOf(beyond)
      }}
    >
      {children}
    </Box>
  )
})

export default SideScroll
