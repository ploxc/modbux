import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import Button, { ButtonProps } from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { clientOwner } from '@shared'
import { useCallback } from 'react'
import {
  selectedClientUuid,
  useClientZustand,
  getShownType,
  getSelectedUnit,
  readsNothingIn
} from '@renderer/context/client.zustand'

const ReadButton = meme((): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const connected = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState === 'connected'
  )

  // What main would refuse this press for, which is the same question it asks
  // of every caller that puts a request on the wire. Naming a subset of it
  // left the button pressable during both scans, where it was reachable only
  // by what the two dialogs happen to draw over.
  const owner = useLiveZustand((z) => clientOwner(dataOf(z, selectedUuid).clientState))

  // A read in flight is the one state this says something about rather than
  // just refusing.
  const reading = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.reading)

  // What main refuses as a read of no registers.
  const type = useSectionType()
  const readsNoRegisters = useClientZustand((z) => readsNothingIn(z, z.selectedUuid, type))

  const handleRead = useCallback(() => {
    window.api.read({
      uuid: selectedClientUuid(),
      unit: getSelectedUnit().uuid,
      type: getShownType()
    })
  }, [])

  const color: ButtonProps['color'] = reading ? 'warning' : 'primary'
  const disabled = !connected || owner !== undefined || readsNoRegisters

  return (
    <Button
      data-testid="read-btn"
      disabled={disabled}
      color={color}
      size="small"
      variant="outlined"
      onClick={handleRead}
    >
      Read
    </Button>
  )
})

export default ReadButton
