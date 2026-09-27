import InputBase, { InputBaseComponentProps } from '@mui/material/InputBase'
import Tooltip from '@mui/material/Tooltip'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UnitIdInput from '@renderer/components/shared/inputs/UnitIdInput'
import { selectedClient, selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { unitIdOutOfRange } from '@shared'
import { ElementType, KeyboardEvent, useCallback, useState } from 'react'

/** The selected unit's id, typed in place of the badge on its tab. */
const UnitIdField = meme(({ onDone }: { onDone: () => void }): JSX.Element => {
  const unitId = useClientZustand((z) => String(selectedUnit(z).unitId))
  // A string or undefined, which compares equal from one read to the next.
  const outOfRange = useClientZustand((z) =>
    unitIdOutOfRange({
      protocol: selectedClient(z).connectionConfig.protocol,
      unitId: selectedUnit(z).unitId
    })
  )

  // The id typed when another unit of the client already has it. The store
  // keeps the id it had, so the refusal lives here.
  const [taken, setTaken] = useState<string | undefined>(undefined)
  const handleUnitId = useCallback((value: string) => {
    const state = useClientZustand.getState()
    const own = selectedUnit(state)
    const clash = selectedClient(state).units.some(
      (unit) => unit.uuid !== own.uuid && String(unit.unitId) === value
    )
    setTaken(clash ? `Another unit already has ID ${value}` : undefined)
    if (!clash) void state.setUnitId(value)
  }, [])
  const problem = taken ?? outOfRange
  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Escape') onDone()
    },
    [onDone]
  )

  return (
    <Tooltip title={problem ?? ''} open={problem !== undefined}>
      <InputBase
        autoFocus
        value={unitId}
        error={problem !== undefined}
        onBlur={onDone}
        onKeyDown={handleKey}
        data-testid="client-unitid-input"
        inputComponent={UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>}
        inputProps={{ ...maskInputProps({ set: handleUnitId }), 'aria-label': 'Unit ID' }}
        sx={(theme) => ({
          fontFamily: 'monospace',
          fontSize: 11.5,
          width: 44,
          px: 0.75,
          borderRadius: 1,
          background: theme.palette.action.selected,
          color: problem === undefined ? undefined : theme.palette.error.light
        })}
      />
    </Tooltip>
  )
})

export default UnitIdField
