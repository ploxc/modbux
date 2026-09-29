import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand, selectedUnit } from '@renderer/context/client.zustand'
import { ChangeEvent, useCallback } from 'react'

/**
 * Whether a poll reads the register type on screen, of the unit on screen:
 * its groups under read configuration, its window otherwise.
 */
const SectionPollSwitch = meme(() => {
  const type = useSectionType()
  const polled = useClientZustand((z) => selectedUnit(z).sections[type].polled)

  const handleChange = useCallback(
    (_event: ChangeEvent<HTMLInputElement>, checked: boolean): void => {
      const clientZustand = useClientZustand.getState()
      clientZustand.setPolled(type, checked)
    },
    [type]
  )

  return (
    <FormControlLabel
      label="Poll"
      labelPlacement="start"
      control={
        <Switch
          size="small"
          checked={polled}
          onChange={handleChange}
          slotProps={{ input: { 'aria-label': 'Poll this register type' } }}
          data-testid="section-poll-switch"
        />
      }
    />
  )
})

export default SectionPollSwitch
