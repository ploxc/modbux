import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Add from '@mui/icons-material/Add'
import TextField from '@mui/material/TextField'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { maxUnitId } from '@shared'
import { ChangeEvent, FormEvent, useCallback, useMemo, useState } from 'react'

/**
 * The unit id typed, when it is one the client's protocol takes and no unit of
 * the client has. A blank field is no id, and the store then picks the one
 * after the highest.
 */
const typedUnitId = (text: string, max: number, taken: string[]): number | undefined | null => {
  if (text === '') return undefined
  if (!/^\d+$/.test(text)) return null
  const unitId = Number(text)
  return unitId > max || taken.includes(String(unitId)) ? null : unitId
}

/** The row under a client's units that adds one: an id, a name and Add. */
const AddUnitRow = meme(({ uuid }: { uuid: string }) => {
  const protocol = useClientZustand((z) => z.clients[uuid]?.connectionConfig.protocol)
  // Joined, so the answer compares equal while the ids stay the same.
  const takenList = useClientZustand(
    (z) => z.clients[uuid]?.units.map((unit) => unit.unitId).join(',') ?? ''
  )
  const taken = useMemo(() => takenList.split(','), [takenList])
  const [unitIdText, setUnitIdText] = useState('')
  const [name, setName] = useState('')

  const max = protocol === undefined ? 0 : maxUnitId(protocol)
  const unitId = typedUnitId(unitIdText, max, taken)

  const handleUnitId = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setUnitIdText(event.target.value),
    []
  )
  const handleName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
    []
  )
  const handleAdd = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (unitId === null) return
      const clientZustand = useClientZustand.getState()
      // `addUnit` adds to the client on screen.
      clientZustand.setSelectedUuid(uuid)
      if (useClientZustand.getState().selectedUuid !== uuid) return
      if (!(await clientZustand.addUnit(unitId, name))) return
      setUnitIdText('')
      setName('')
    },
    [uuid, unitId, name]
  )

  return (
    <Box
      component="form"
      onSubmit={handleAdd}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        pt: 1,
        pb: 0.5,
        mt: 0.5,
        borderTop: '1px solid',
        borderColor: 'divider'
      }}
    >
      <TextField
        size="small"
        placeholder="ID"
        value={unitIdText}
        onChange={handleUnitId}
        error={unitId === null}
        slotProps={{
          htmlInput: {
            inputMode: 'numeric',
            'aria-label': 'Unit ID',
            'data-testid': `client-add-unit-id-${uuid}`
          }
        }}
        sx={{ width: 44, flexShrink: 0 }}
      />
      <TextField
        size="small"
        placeholder="Name (optional)"
        value={name}
        onChange={handleName}
        slotProps={{
          htmlInput: { 'aria-label': 'Unit name', 'data-testid': `client-add-unit-name-${uuid}` }
        }}
        sx={{ flexGrow: 1, minWidth: 0 }}
      />
      <IconButton
        type="submit"
        size="small"
        aria-label="Add unit"
        disabled={unitId === null}
        data-testid={`client-add-unit-btn-${uuid}`}
        sx={{ color: 'primary.light' }}
      >
        <Add fontSize="small" />
      </IconButton>
    </Box>
  )
})

export default AddUnitRow
