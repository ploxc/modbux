import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  readsConfiguration,
  useClientZustand,
  selectedUnit
} from '@renderer/context/client.zustand'
import { ChangeEvent, useCallback } from 'react'

/**
 * Whether a poll reads the register type on screen, of the unit on screen.
 *
 * Under read configuration a poll reads every type the mapping has groups for
 * and not the sections, so the switch has nothing to say then.
 */
const SectionPollSwitch = meme(() => {
  const type = useSectionType()
  const polled = useClientZustand((z) => selectedUnit(z).sections[type].polled)
  const readConfiguration = useClientZustand((z) => readsConfiguration(z))

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
      disabled={readConfiguration}
      sx={{ mx: 0, gap: 0.5 }}
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
